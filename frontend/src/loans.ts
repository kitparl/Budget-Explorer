import {
    OTHERS, CUSTOMER_LOAN_APPLICATION_PATH,
    CUSTOMER_TERMS_CONDITIONS_PATH
} from './../../../common/constants/common';
import { Request, Response } from 'express';
import {
    internalServerError, sendErrorResponse, sendSuccessResponse, sendSuccessResponseSafe, setCount,
} from "../../../common/library/responseHandler";
import { getLimitFromRequest } from "../../../common/library/helper/getLimitFromRequest";
import db from "../../models";
import { isDefined } from "../../../common/library/helper/isDefined";
import { parenthesis } from "../../../common/library/helper/string";
import { Column, Excel } from "../../../common/library/excel";
import { APP_NAME, GATEWAY_MODE, EMI, CUSTOMER_PAYMENT_EMI, LOAN_CLOSURE, PRE_CLOSURE, LOAN_ENACH_REGISTRATION, LIMIT_DATE_TO_CANCEL_INSURANCE, PARTIALLYPAID } from "../../../common/constants/common";
import {
    LOAN_NOT_FOUND, PRINCIPAL_OUTSTANDING_CANNOT_BE_NEGATIVE
} from "../../../common/constants/messages.error";
import { BAD_REQUEST, NOT_FOUND } from "../../../common/constants/http.code";
import {
    LOAN_APPLICATION_ADDRESS_PROOF_NOTE_UPLOADED,
    LOAN_APPLICATION_COVER_NOTE_UPLOADED, LOAN_APPLICATION_ID_PROOF_UPLOADED, LOAN_APPLICATION_INVOICE_UPLOADED,
    LOANS_EMI_PENALTY_WAIVED_OFF,
    LOANS_SERVICE_DISCONTINUE_REQUESTED,
    LOANS_SERVICE_RESUME_REQUESTED,
    LOANS_MARK_AS_PAID_SUCCESS,
    LOANS_AUTO_DEBIT_REGISTRATION_LINK_SENT,
    LOAN_ADDITIONAL_DOCUMENT_UPLOADED,
    LOAN_CLOSER_REJECTED, LOAN_CLOSER_REQUEST_INITIATED,
    LOAN_INSURANCE_REVERTED,
    EXPORT_DATA_NOT_FOUND,
    LOAN_APPLICATION_BITLY_SENT
} from "../../../common/constants/messages.success";
import { sendEmail } from "../../../common/library/mailer/sns";
import serviceDiscontinueEmailTemplate from "../../../common/templates/serviceDiscontinueEmail";
import serviceResumeEmailEmailTemplate from "../../../common/templates/serviceResumeEmail";
import { templateRenderer } from "../../../common/templates";
import { forEach, includes, isNull, template } from "lodash";
import { REQUEST_TO_DISCONTINUE, REQUEST_TO_RESUME, ENACH_REGISTRATION, EMAIL_FOR_EMI_PAYMENT_DONE, LOAN_CLOSER_INITIATED, CANCELLED_INSURANCE, LOAN_NOC_EMAIL } from "../../../common/constants/email.subjects";
import * as ERROR_MESSAGES from "../../../common/constants/messages.error";
import { mimes } from "../../../common/constants/mimes";
import { s3ObjectName, s3ObjectFixedName } from "../../../common/library/helper/s3ObjectName";
import { s3Upload, getSignedURL } from "../../../common/library/s3";
import * as moment from "moment";
import { RazorpayClient } from "../../../common/library/helper/razorpay";
import { sendSMS } from '../../../common/library/sms';
import { generateBitlyLink } from '../../../common/library/bitly';
import { getEmiSummary, getSummary2 } from '../../../common/library/loan/getEmiSummary';
import { formSentence } from '../../../common/library/helper/generateEmiCountforTemplate';
import Sequelize from 'sequelize';
import * as queryBuilder from 'squel';
import { randomBytes } from 'crypto';
import { APPLICATION_STATE } from '../../../common/constants/application.state';
import { calculateRevisedEmi } from '../../../common/library/helper/calculateEmiRevised';
import { generatePassword as generateHash, decryptText } from "../../../common/library/helper/generateCryptos";
import { generateLoanApplicationNumber, generateLoanNumber } from "../../../common/library/helper/generateIdFromParameters";
import { Controller as ApplicationController } from "../../controllers/application/controller";
import { calculateAge, contentOfNocToCustomer, getDateInDDMMYYYYFormat, rupeesRoundToTwo } from "../../../common/utils/index";
import { DigioClient } from '../../../common/library/helper/digio';
import { logCreatedBy, adminiCreatedBy, adminiUpdatedBy, logUpdatedBy } from '../../../common/library/helper/administrativeLogs';
import { TransactionHandler } from '../../../common/library/db/transactionHandler';
import { emitWebHookEvent, getApiUserId } from '../../../common/library/webhook';
import { APIWEBHOOKS } from '../../../common/constants/apiname';
import { parseInput } from '../../../common/library/helper/advanceInput';
import { CKYCService } from '../../../../server/common/library/cKyc';
import { arrayBufferToBuffer } from "../../../common/library/helper/generatePdf";
import { cKycClient } from '../../../../server/common/library/helper/cKyc';

import { buffToBase64 } from '../../../../server/common/library/helper/common';
import { PaymentGateway } from '../../../common/library/helper/paymentGateways/paymentGateway';


interface Notes {
    loanApplicationId: Number,
    loanId: Number,
    paymentType: Number
}

interface Entity {
    id: string,
    status: string,
    error_description: string,
    error_code: string,
    method: string,
    notes: Notes
}

interface Payload {
    payment: Payment
}

interface Payment {
    entity: Entity
}

interface IRazorPayEvent {
    event: String,
    payload: Payload
}

interface OfflineEmiPayment {
    loanId: string,
    paymentAmount: string,
    method: string,
    userId: string,
    remark: string,
    paidAt: string
}

/**
 * Static controller class defines the methods for all the API verbs such as GET, POST, PUT
 */
export class Controller {
    /**
     * Retrieves the loan applications
     * @param req
     * @param res
     */
    static async getList(req: Request, res: Response) {
        try {
            if(!req.user.role){
                return sendErrorResponse(res, "Branch selection required.", BAD_REQUEST);
            }

            // GIT 421 - TODO - Due to performance issues, LoanEmis has been dropped 
            let paginate = true, isUserRoleAdmin = false;
            if (['SYSTEM_ADMIN', 'PROMOTER'].indexOf(req.user.role) >= 0) {
                isUserRoleAdmin = true;
            }
            // Fetch the loan using the private common method
            let result = await Controller._getList(req, paginate, isUserRoleAdmin);

            if (isDefined(req.params.id) && result) {
                return sendSuccessResponse(res, result);
            }

            let rows = [];

            // Fetch the global settings
            let settings = await db.GlobalSetting.findOne({ where: { isActive: true } });

            // Format the records a little bit
            for (let row of result) {
                let temp = row;

                // Add the total payment received.
                temp.paymentsReceived = temp.paymentsReceived
                    ? temp.paymentsReceived : 0;

                if (isUserRoleAdmin) {
                    rows.push({
                        ...temp,
                        loanStartDay: settings.loanStartDay
                    });
                } else {
                    // Add additional processed data to show in partner-ui dashboard
                    const Extras = Controller._partialProcessOfLoanDataForExcel(settings.loanStartDay, temp, settings.gstPercentage);
                    rows.push({
                        ...temp,
                        Extras
                    });
                }
            }

            // Set the header count
            setCount(res, result.length || 0);

            // Set the response and send it to the client.
            sendSuccessResponse(res, rows);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Retrieves the loan applications
     * @param req
     * @param res
     */
    static async getLoansSummary(req: Request, res: Response) {
        const labels = [
            { start: 0, end: 30, label: "<30", count: 0 },
            { start: 30, end: 60, label: "30-60", count: 0 },
            { start: 60, end: 90, label: "60-90", count: 0 },
            { start: 90, end: 120, label: "90-120", count: 0 },
            { start: 120, end: 150, label: "120-150", count: 0 },
            { start: 150, end: 180, label: "150-180", count: 0 },
            { start: 180, end: null, label: "180+", count: 0 },
        ];
        const prepareCaseQuery = (ranges: Array<{ start: any, end: any, label: string, count: number }>) => {
            const base = queryBuilder.case(null);
            for (let range of ranges) {
                if (range.start !== null && range.end !== null) {
                    base.when("DATEDIFF(CURRENT_DATE(), L.dueDate) >= ? AND DATEDIFF(CURRENT_DATE(), L.dueDate) < ?", range.start, range.end)
                        .then(range.label);
                }
                if (range.start >= 180) {
                    base.when("DATEDIFF(CURRENT_DATE(), L.dueDate) >= ?", range.start).then(range.label)
                }
            }
            return base;
        }

        const inQuery = queryBuilder.select()
            .from("LoanEmis", "L")
            .field("L.loanNumber")
            .field("L.dueDate")
            .field("DATEDIFF(CURRENT_DATE(), L.dueDate)", "diff")
            .field(prepareCaseQuery(labels), "label")
            .where("L.status = ? OR (L.status = ? AND current_date() >= L.dueDate )", 'Not Paid', 'Partially Paid')
            .where("L2.status IN ?", ['active', 'delinquent'])
            .having("label IS NOT NULL")
            .group("L.loanNumber")
            .order("L.loanNumber", true)
            .order("diff", false)
            .left_join("Loans", "L2", "L2.id = L.loanId");


        if (req.query.id) {
            if (req.query.id == 1) {
                inQuery.where("L2.organizationId = ? OR L2.organizationId IS NULL", req.query.id);
            } else {
                inQuery.where("L2.organizationId = ?", req.query.id);
            }
        }

        const query = queryBuilder.select()
            .from(inQuery, "origin")
            .field("origin.label")
            .field("count(origin.loanNumber)", "delinquents")
            .group("origin.label").toString();

        const rows = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });

        for (let row of rows) {
            const label = labels.find(o => o.label === row.label);
            if (label) {
                label.count = row.delinquents;
            }
        }

        sendSuccessResponse(res, labels);
    }
    /**
    * Private common method to process partial loan data for excel calculation
    * @param loan
    * @param paginate
    * @private
    */
    private static _partialProcessOfLoanDataForExcel(loanStartDay, loan, gstPercentage, insuranceAmtToBeAddedToSanctionAmt = 0) {
        // Info: Any changes made here, we also need to make changes in admin front-end (loans/expand/expand.component.ts -> generateWelcomeLetterPdf)
        const isLoanEmiExist = (loan.LoanEmis && (loan.LoanEmis.length > 0)) || false;
        if (loan.LoanApplication &&
            loan.LoanApplication.Branch &&
            loan.LoanApplication.Branch.Partner &&
            loan.LoanApplication.Branch.Partner.PartnerLoanSetting &&
            loan.LoanApplication.Branch.Partner.PartnerLoanSetting.isGSTExemption) {
            gstPercentage = 0;
        }
        let subventionAmt = rupeesRoundToTwo((loan.LoanApplication.serviceAmount * loan.subvention) / 100);
        return {
            subventionAmt: subventionAmt,
            gstOnSubvention: !loan.LoanApplication.isGSTExemption ? rupeesRoundToTwo(subventionAmt * gstPercentage / 100) : 0,
            totalsubvention: !loan.LoanApplication.isGSTExemption ? rupeesRoundToTwo(subventionAmt + (subventionAmt * gstPercentage / 100)) : rupeesRoundToTwo(subventionAmt),
            residualEMI: (loan.LoanApplication.loanTerm - (loan.LoanApplication.partnerAdvanceEmiTenure + loan.LoanApplication.systemAdvanceEmiTenure + loan.LoanApplication.moratoriumTenure)),
            model: loan.LoanApplication.loanTerm + "|" + (loan.LoanApplication.partnerAdvanceEmiTenure + loan.LoanApplication.systemAdvanceEmiTenure),
            dnToTcpl: rupeesRoundToTwo(loan.loanAmount / loan.LoanApplication.loanTerm * loan.LoanApplication.systemAdvanceEmiTenure),
            dnToPartner: rupeesRoundToTwo(loan.LoanApplication.serviceAmount / loan.LoanApplication.loanTerm * loan.LoanApplication.partnerAdvanceEmiTenure),
            sanctionAmt: rupeesRoundToTwo(loan.LoanApplication.serviceAmount - (loan.LoanApplication.serviceAmount / loan.LoanApplication.loanTerm * loan.LoanApplication.systemAdvanceEmiTenure) - (
                loan.LoanApplication.serviceAmount / loan.LoanApplication.loanTerm * loan.LoanApplication.partnerAdvanceEmiTenure
            ) + insuranceAmtToBeAddedToSanctionAmt),
            emiStartDate: getDateInDDMMYYYYFormat(loan.emiStartDate, loanStartDay),
            emiEndDate: getDateInDDMMYYYYFormat(loan.emiEndDate, loanStartDay),
            emiPaid: loan.LoanEmis.filter(emi => emi.status === 'Paid').length,
            emiDue: loan.LoanEmis.filter(emi => emi.status !== 'Paid').length,
            emiOverDue: loan.LoanEmis.filter(emi => emi.status === 'Not Paid').length + loan.LoanEmis.filter(emi => emi.status === 'Partially Paid').length,
            delinquent: (() => {
                if (loan.LoanEmis.filter(emi => emi.status === 'Not Paid').length + loan.LoanEmis.filter(emi => emi.status === 'Partially Paid').length >= 1) { return 'Non Current'; }
                else return 'Current';
            })()
        };
    }
    /**
* Private method to get the status of service
* @param loan
* @param paginate
* @private
*/
    private static _getServiceStatus(loanStatus) {
        let status;
        switch (loanStatus) {
            case 'PROCESSED': status = 'Not Disbursed';
                break;
            case 'PROCESSING': status = 'Processing';
                break;
            case 'DISBURSED': status = 'Disbursed';
                break;
            default: status = '';
        }
        return status;
    }
    /**
     * Exports to excel
     * @param req
     * @param res
     */
    static async exportToExcel(req: Request, res: Response) {
        try {
            const OFFSET = process.env.SERVER_DEFAULT_OFFSET || '0';
            // Fetch the loan using the private common method
            let excelSheet = new Excel,
                result = await Controller._getExportList(req, false, false);

            // Fetch the global settings
            let settings = await db.GlobalSetting.findOne({ where: { isActive: true } });

            // Prepare the excel headers.
            let columns: Array<Column> = [
                //new enhancement in partner-ui
                { header: 'Application Date', key: 'applicationDate', width: 15 },
                { header: 'Application ID', key: 'applicationId', width: 15 },
                { header: 'Loan Date', key: 'createdAt', width: 15 },
                { header: 'Loan ID', key: 'id', width: 25 },
                { header: 'Customer Name', key: 'customerName', width: 20 },
                { header: 'Customer ID', key: 'customerId', width: 25 },
                { header: 'Age', key: 'age', width: 10 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Mobile', key: 'mobile', width: 30 },
                { header: 'Pin Code', key: 'pincode', width: 10 },
                { header: 'City', key: 'city', width: 10 },
                { header: 'Sector', key: 'sector', width: 10 },
                { header: 'Service', key: 'service', width: 10 },
                { header: 'Partner', key: 'partner', width: 30 },
                { header: 'Branch', key: 'location', width: 10 },
                { header: 'Loan Amount', key: 'loanAmount', width: 15 },
                // { header: 'Insurance', key: 'insurance', width: 10 },
                { header: 'Tenure(in Months)', key: 'loanTerm', width: 10 },
                { header: 'EMI', key: 'emi', width: 10 },
                { header: 'Model', key: 'model', width: 10 },
                { header: 'Emandate Done', key: 'emandate', width: 10 },
                { header: 'Emandate Partner', key: 'emandatePartner', width: 10 },
                { header: 'Down payment To TCPL', key: 'dnToTcpl', width: 10 },
                { header: 'Down payment To Partner', key: 'dnToPartner', width: 10 },
                { header: 'Net Loan Amount', key: 'sanctionAmt', width: 10 },
                { header: 'POS', key: 'pos', width: 10 },
                { header: 'Interest %', key: 'interest', width: 10 },
                { header: 'Subvention %', key: 'subvention', width: 10 },
                { header: 'Subvention Amount', key: 'subventionAmt', width: 10 },
                { header: 'GST On Subvention', key: 'gstOnSubvention', width: 10 },
                { header: 'Subvention+GST', key: 'totalsubvention', width: 10 },
                { header: 'Processing Fee', key: 'processingFee', width: 10 },
                { header: 'Processing Fee To Partner', key: 'processingFeeToPartner', width: 10 },
                { header: 'Net Disbursement', key: 'netDisbursement', width: 10 },
                { header: 'Holdback Payment Amount', key: "holdbackPaymentAmount", width: 10 },
                { header: 'Holdback Payment Status', key: "holdbackPaymentStatus", width: 10 },
                { header: 'Service Status', key: "serviceStatus", width: 10 },
                { header: 'EMI Start Date(DD-MM-YYYY)', key: 'emiStartDate', width: 10 },
                { header: 'EMI End Date(DD-MM-YYYY)', key: 'emiEndDate', width: 10 },
                { header: 'Service User Name', key: 'serviceUserName', width: 20 },
                { header: 'Service User Relationship', key: 'serviceUserRelationship', width: 20 },
                { header: 'Service User Email', key: 'serviceUserEmail', width: 30 },
                { header: 'Status', key: 'status', width: 20 },
                { header: 'No Of EMI Paid ', key: 'emiPaid', width: 10 },
                { header: 'No Of EMI Due', key: 'emiDue', width: 10 },
                { header: 'EMI Amount Due', key: 'emiAmountDue', width: 10 },
                { header: 'EMI Amount Paid', key: 'emiAmountPaid', width: 10 },
                { header: 'Penal Pending', key: 'penalPending', width: 10 },
                { header: 'Bounce Pending', key: 'bouncePending', width: 10 },
                { header: 'Partner Payment UTR', key: 'partnerPaymentUTR', width: 20 },
                { header: 'Date of Disbursement', key: 'dateofDisbursement', width: 20 },
                { header: 'Course Name', key: 'courseName', width: 20 },
                { header: 'Course Tenure', key: 'courseTenure', width: 20 },
                { header: 'University Name', key: 'universityName', width: 20 },
                { header: 'Enrollment Id', key: 'serviceUserEnrollmentId', width: 20 },
                { header: 'Logged By', key: 'loggedBy', width: 20 }
            ];

            // Format the rows a little bit to fit into the excel
            let rows = result.map((o: any) => {
                const additionalProcessedData = Controller._partialProcessOfLoanDataForExcel(settings.loanStartDay, o, settings.gstPercentage);
                return {
                    applicationDate: moment(o.LoanApplication.createdAt).format('DD-MM-YYYY'),
                    createdAt: moment(o.createdAt).format('DD-MM-YYYY'),
                    applicationId: o.LoanApplication.applicationNumber,
                    id: o.loanNumber,
                    customerName: o.Customer.name,
                    customerId: o.Customer.customerId,
                    age: calculateAge(o.Customer.dob),
                    email: o.Customer.email,
                    mobile: o.Customer.mobile,
                    pincode: o.Customer.pincode,
                    city: o.Customer.city,
                    loggedBy: o.LoanApplication.User ? (o.LoanApplication.User.firstName + o.LoanApplication.User.lastName) : '#N/A',
                    courseName: o.LoanApplication.courseName || '#N/A',
                    courseTenure: o.LoanApplication.courseTenure || '#N/A',
                    universityName: o.LoanApplication.universityName || '#N/A',
                    serviceUserEnrollmentId: o.LoanApplication.serviceUserEnrollmentId || '#N/A',
                    sector: o.LoanApplication.Branch.Partner.Service.Sector.name,
                    service: o.LoanApplication.Branch.Partner.Service.name,
                    location: o.LoanApplication.Branch.name,
                    partner: o.LoanApplication.Branch.Partner.name,
                    loanAmount: o.loanAmount,
                    //insurance: o.LoanApplication.applyInsurance ? o.LoanApplication.insuranceAmount : 0,
                    loanTerm: o.LoanApplication.loanTerm,
                    emandate: o.eNachToken && o.LoanApplication.emandate ? 'YES - ' + o.LoanApplication.emandate : o.eNachToken &&
                        !o.LoanApplication.emandate || o.digioUmrn ? 'YES' : 'NO',
                    emi: rupeesRoundToTwo(o.emiAmount),
                    emandatePartner: o.LoanApplication.emandate ? o.LoanApplication.eMandatePartner : "NO",
                    interest: o.LoanApplication.interest,
                    subvention: o.subvention,
                    pos: rupeesRoundToTwo(o.outstandingAmount),
                    processingFee: o.LoanApplication.processingFee,
                    processingFeeToPartner: o.LoanApplication.processingFeeToPartner,
                    gstOnProcessingFee: 0,
                    emiAmountDue: rupeesRoundToTwo(o.emiAmount),
                    emiAmountPaid: rupeesRoundToTwo(o.paymentsReceived),
                    penalPending: o.totalPenaltyCharges,
                    bouncePending: o.totalBounceCharges,
                    invoice: o.LoanApplication.pathToInvoiceS3 ? 'Yes' : 'No',
                    netDisbursement: rupeesRoundToTwo(o.PartnerPayments && o.PartnerPayments[0] ? o.PartnerPayments[0].initialPaymentAmount : 0),
                    holdbackPaymentAmount: rupeesRoundToTwo(o.PartnerPayments && o.PartnerPayments[0] ? o.PartnerPayments[0].holdBackPaymentAmount : 0),
                    holdbackPaymentStatus: (o.PartnerPayments && o.PartnerPayments[0]) ? (o.PartnerPayments && o.PartnerPayments[0].holdBackPaymentID ? 'Paid' : 'Not Paid') : 'Not Paid',
                    ...additionalProcessedData,
                    serviceStatus: Controller._getServiceStatus(o.loanStatus),
                    serviceUserName: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : ((o.LoanApplication.serviceUserSalutation) + (o.LoanApplication.serviceUserFirstName) + (o.LoanApplication.serviceUserLastName)),
                    serviceUserRelationship: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : o.LoanApplication.serviceUserRelationship,
                    serviceUserEmail: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : o.LoanApplication.serviceUserEmail,
                    status: !o.subStatus ? o.status : o.status + '-' + o.subStatus,
                    partnerPaymentUTR: o.LoanPaymentAdvicetoPartner ? o.LoanPaymentAdvicetoPartner.fundTransferReferenceId : '#N/A',
                    dateofDisbursement: moment(o.disbursedAt).utcOffset(parseInt(OFFSET)).format('DD-MM-YYYY hh:mm A')
                }
            });

            // Create an excel instance and send the file to the client.
            excelSheet.setCreator(APP_NAME)
                .addSheet(columns, rows, 'Loans')
                .writeToDownloadStream(res, 'Loans');
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async downloadPanLogPdf(req, res) {
        try {
            let url = 'LA/' + `${req.params.id}-panLog.pdf`;
            url = await getSignedURL(url);
            sendSuccessResponse(res, url);
        } catch (e) {
            sendErrorResponse(res, e)
        }
    }
    /**
   * Exports to excel
   * @param req
   * @param res
   */

    static async exportDRFToExcel(req: Request, res: Response) {
        try {
            const OFFSET = process.env.SERVER_DEFAULT_OFFSET || '0';
            // Fetch the loan using the private common method
            let excelSheet = new Excel,
                result = await Controller._getExportList(req, false, false);

            if (!result.length)
                return sendErrorResponse(res, EXPORT_DATA_NOT_FOUND, BAD_REQUEST);

            // Fetch the global settings
            let settings = await db.GlobalSetting.findOne({ where: { isActive: true } });

            // Prepare the excel headers.
            let columns: Array<Column> = [
                //new enhancement for ABFL DRF
                { header: 'Loan Date', key: 'createdAt', width: 15 },
                { header: 'Application Form Number', key: 'id', width: 25 },
                { header: 'ABFL LAN', key: 'AbflLan', width: 20 },
                { header: 'Down payment To ABFL', key: 'dnToTcpl', width: 10 },
                { header: 'Down payment To Partner', key: 'dnToPartner', width: 10 },
                { header: 'Processing Fee To ABFL', key: 'processingFee', width: 10 },
                { header: 'Processing Fee To Partner', key: 'processingFeeToPartner', width: 10 },
                { header: 'Transaction Amount ( Net disbursal amount )', key: 'netDisbursement', width: 10 },
                { header: 'Bank Name', key: 'disbursementBank', width: 15 },
                { header: 'Benefirciary Name', key: 'branch', width: 25 },
                { header: 'Beneficiary  Ac No.', key: 'accountNumber', width: 15 },
                { header: 'IFSC Code', key: 'ifsc', width: 15 },
                { header: 'UTR No', key: 'UTRNo', width: 15 },
                { header: 'Date of transaction', key: 'dateofTransaction', width: 15 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Remark', key: 'remark', width: 15 },
                { header: 'PF UTR', key: 'pFUTR', width: 15 },
                { header: 'Adv UTR', key: 'advUTR', width: 15 },
                { header: 'Slot No', key: 'slotNo', width: 15 }
            ];

            // Format the rows a little bit to fit into the excel
            let rows = result.map((o: any) => {
                const additionalProcessedData = Controller._partialProcessOfLoanDataForExcel(settings.loanStartDay, o, settings.gstPercentage);
                return {
                    createdAt: moment(o.createdAt).format('DD-MM-YYYY'),
                    id: o.loanNumber,
                    AbflLan: '#N/A',
                    processingFee: o.LoanApplication.processingFee,
                    processingFeeToPartner: o.LoanApplication.processingFeeToPartner,
                    netDisbursement: rupeesRoundToTwo(o.PartnerPayments[0] ? o.PartnerPayments[0].initialPaymentAmount : 0),
                    ...additionalProcessedData,
                    disbursementBank: o.LoanApplication.Branch.bank,
                    branch: o.LoanApplication.Branch.name,
                    accountNumber: o.LoanApplication.Branch.accountNumber,
                    ifsc: o.LoanApplication.Branch.ifsc,
                    status: '#N/A',
                    UTRNo: '#N/A',
                    dateofTransaction: '#N/A',
                    remark: '#N/A',
                    pFUTR: '#N/A',
                    advUTR: '#N/A',
                    slotNo: '#N/A',
                    partnerPaymentUTR: o.LoanPaymentAdvicetoPartner ? o.LoanPaymentAdvicetoPartner.fundTransferReferenceId : '#N/A',
                    dateofDisbursement: moment(o.disbursedAt).utcOffset(parseInt(OFFSET)).format('DD-MM-YYYY hh:mm A')
                }
            });

            // Create an excel instance and send the file to the client.
            excelSheet.setCreator(APP_NAME)
                .addSheet(columns, rows, 'Loans')
                .writeToDownloadStream(res, 'Loans');
        }
        catch (e) {
            internalServerError(res, e)
        }
    }
    /**
     * Exports to credit excel
     * @param req
     * @param res
     */
    static async exportToCreditExcel(req: Request, res: Response) {
        let excelExport = req.user.organizationId;
        const organizationId = req.query.organization;

        if (excelExport == 1) {
            excelExport = organizationId;
        }

        try {
            // Fetch the loan using the private common method
            let excelSheet = new Excel,
                result = await Controller._getExportList(req, false, organizationId);

            if (!result.length)
                return sendErrorResponse(res, EXPORT_DATA_NOT_FOUND, BAD_REQUEST);

            excelExport = parseInt(excelExport);
            switch (excelExport) {
                case 2:
                    let columns1: Array<Column> = [
                        { header: 'Application Date', key: 'applicationDate', width: 15 },
                        { header: 'Application ID', key: 'applicationId', width: 15 },
                        { header: 'UMRN/TokenId', key: 'umrn', width: 15 },
                        { header: 'Institution', key: 'institution', width: 10 },
                        { header: 'Applicant Name', key: 'accountName', width: 20 },
                        { header: 'Student Name', key: 'serviceUserName', width: 10 },
                        { header: 'Employment Type', key: 'employmentType', width: 10 },
                        { header: 'Branch', key: 'location', width: 10 },
                        { header: 'Email', key: 'email', width: 30 },
                        { header: 'Mobile', key: 'mobile', width: 30 },
                        { header: 'DOB (DD-MM-YYYY)', key: 'dob', width: 10 },
                        { header: 'Total Loan Tenure (Months)', key: 'loanTerm', width: 30 },
                        { header: 'No of Adv EMI', key: 'advanceTenure', width: 30 },
                        //{ header: 'Balance Tenure', key: 'balanceTenure', width: 30 },
                        { header: 'Model', key: 'model', width: 10 },
                        { header: 'Bureau Score(Hard)', key: 'bureauScore', width: 20 },
                        { header: 'Bureau Score(Soft)', key: 'bureauScoreSoft', width: 20 },
                        { header: 'Loan ID', key: 'id', width: 25 },
                        { header: 'Loan Date', key: 'createdAt', width: 15 },
                        { header: 'Pan Number', key: 'panNumber', width: 30 },
                        { header: 'Name As Pan', key: 'nameAsPan', width: 50 },
                        { header: 'Loan Amount', key: 'loanAmount', width: 15 },
                        { header: 'EMI amount', key: 'emiAmount', width: 15 },
                        { header: 'EMI Start Date', key: 'emiStartDate', width: 15 },
                        { header: 'Beneficiary Name', key: 'beneficiaryName', width: 15 },
                        { header: 'Maximum EMI amount', key: 'maximumEmiAmount', width: 15 },
                        { header: 'Interest %', key: 'interest', width: 10 },
                        { header: 'Subvention %', key: 'subvention', width: 10 },
                        { header: 'POS', key: 'pos', width: 10 },
                        { header: 'Subvention Amount', key: 'subventionAmt', width: 10 },
                        { header: 'GST On Subvention', key: 'gstOnSubvention', width: 10 },
                        { header: 'Subvention+GST', key: 'totalsubvention', width: 10 },
                        { header: 'Processing Fee To Customer', key: 'processingFeeToCustomer', width: 10 },
                        { header: 'Processing Fee To Partner (Excl GST)', key: 'processingFeeToPartnerAmount', width: 10 },
                        { header: 'GST on Processing Fee To Partner', key: 'processingFeeToPartnerGST', width: 10 },
                        { header: 'Processing Fee To Partner (Inclusive GST)', key: 'processingFeeToPartner', width: 10 },
                        { header: 'Advance To AFSL', key: 'dnToTcpl', width: 15 },
                        { header: 'Advance To Partner', key: 'dnToPartner', width: 15 },
                        { header: 'Net Disbursement', key: 'netDisbursement', width: 10 },
                        { header: 'Advance EMI Traf date', key: 'advanceEmiTrafDate', width: 15 },
                        { header: 'Adv EMI UTR Details', key: 'advanceEmiTrafDate', width: 15 },
                        { header: 'No of Tranches', key: 'noOfTranches', width: 15 },
                        { header: '1st Tranche Ratio', key: 'firstTrancheRatio', width: 15 },
                        { header: '2nd Tranche Ratio', key: 'secondTrancheRatio', width: 15 },
                        { header: '1st Tranche Amt to be Disbursed', key: 'firstTrancheAmtDisbursed', width: 15 },
                        { header: '1st Tranche disbursed date', key: 'firstTrancheDisbursedDate', width: 15 },
                        { header: '2nd Tranche Amt to be Disbursed', key: 'secondTrancheAmtDisbursed', width: 15 },
                        { header: '2st Tranche disbursed date', key: 'secondTrancheDisbursedDate', width: 15 },
                        { header: 'Disbursement Bank', key: 'disbursementBank', width: 15 },
                        { header: 'Disbursement Branch', key: 'branch', width: 25 },
                        { header: 'Account Number', key: 'accountNumber', width: 15 },
                        { header: 'IFSC', key: 'ifsc', width: 15 },
                        { header: 'Approved By', key: 'approverName', width: 10 },
                        { header: 'Approver Comment', key: 'approverComment', width: 10 },
                    ];

                    const AVANSEOFFSET = process.env.SERVER_DEFAULT_OFFSET || '0';
                    let settings = await db.GlobalSetting.findOne({ where: { isActive: true } });

                    // Format the rows a little bit to fit into the excel
                    let avanserows = result.reduce((a: any, o: any) => {
                        const additionalProcessedData = Controller._partialProcessOfLoanDataForExcel(settings.loanStartDay, o, settings.gstPercentage);
                        let item = {
                            applicationDate: (o.LoanApplication.createdAt ? moment(o.LoanApplication.createdAt).utcOffset(parseInt(AVANSEOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A'),
                            applicationId: o.LoanApplication.applicationNumber,
                            umrn: o.digioUmrn || o.eNachToken || '#N/A',
                            ...additionalProcessedData,
                            beneficiaryName: o.LoanApplication.Branch.beneficiaryName ? o.LoanApplication.Branch.beneficiaryName : o.LoanApplication.Branch.Partner.name,
                            maximumEmiAmount: o.LoanApplication.serviceAmount,
                            institution: o.LoanApplication.Branch.Partner.name,
                            approvedLoanAmount: o.LoanApplication.serviceAmount || '#N/A',
                            approverName: o.LoanApplication.approverName || '#N/A',
                            approverComment: o.LoanApplication.approverComment || '#N/A',
                            accountName: o.Customer.name,
                            serviceUserName: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : ((o.LoanApplication.serviceUserSalutation) + (o.LoanApplication.serviceUserFirstName) + (o.LoanApplication.serviceUserLastName)),
                            employmentType: o.Customer.employmentType || '#N/A',
                            location: o.LoanApplication.Branch.name,
                            email: o.Customer.email,
                            mobile: o.Customer.mobile,
                            loanTerm: o.LoanApplication.loanTerm || '#N/A',
                            dob: moment(o.Customer.dob).format('DD-MM-YYYY'),
                            systemAdvanceEmiTenure: o.LoanApplication.systemAdvanceEmiTenure || '#N/A',
                            //balanceTenure: (o.LoanApplication.loanTerm - (o.LoanApplication.systemAdvanceEmiTenure || 0) || '#N/A'),
                            advanceTenure: (o.LoanApplication.systemAdvanceEmiTenure + o.LoanApplication.partnerAdvanceEmiTenure),
                            bureauScore: o.Customer.cibilScore || '#N/A',
                            bureauScoreSoft: o.Customer.softCibilScore || '#N/A',
                            id: o.loanNumber,
                            createdAt: (o.createdAt ? moment(o.createdAt).utcOffset(parseInt(AVANSEOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A'),
                            panNumber: o.Customer.panNumber,
                            nameAsPan: o.Customer.Pans ? (o.Customer.Pans.status == 'VALID' ? o.Customer.Pans.fullName : "") : "#N/A",
                            loanAmount: o.LoanApplication.serviceAmount,
                            emiAmount: rupeesRoundToTwo(o.emiAmount),
                            dnToTcpl: rupeesRoundToTwo(o.emiAmount * o.LoanApplication.systemAdvanceEmiTenure),
                            dnToPartner: rupeesRoundToTwo(o.emiAmount * o.LoanApplication.partnerAdvanceEmiTenure),
                            advanceEmiTrafDate: '#N/A',
                            noOfTranches: '#N/A',
                            firstTrancheRatio: '#N/A',
                            secondTrancheRatio: '#N/A',
                            firstTrancheAmtDisbursed: o.PartnerPayments[0].initialPaymentAmount,
                            firstTrancheDisbursedDate: (o.disbursedAt ? (moment(o.disbursedAt).utcOffset(parseInt(AVANSEOFFSET)).format('DD-MM-YYYY hh:mm A')) : '#N/A'),
                            secondTrancheAmtDisbursed: o.PartnerPayments && o.PartnerPayments.length ? rupeesRoundToTwo(o.PartnerPayments[0] ? o.PartnerPayments[0].holdBackPaymentAmount : 0) : '#N/A',
                            secondTrancheDisbursedDate: o.PartnerPayments && o.PartnerPayments.length ? (o.PartnerPayments[0] ? o.LoanApplication.holdBackPaymentTerm : 'N/A') : '#N/A',
                            disbursementBank: o.LoanApplication.Branch.bank,
                            branch: o.LoanApplication.Branch.branch,
                            accountNumber: o.LoanApplication.Branch.accountNumber,
                            ifsc: o.LoanApplication.Branch.ifsc,
                            interest: o.LoanApplication.interest,
                            subvention: o.subvention,
                            pos: rupeesRoundToTwo(o.outstandingAmount),
                            subventionAmt: rupeesRoundToTwo((o.LoanApplication.serviceAmount * o.subvention) / 100),
                            gstOnSubvention: rupeesRoundToTwo(((o.LoanApplication.serviceAmount * o.subvention / 100) * 18 / 100)),
                            totalsubvention: rupeesRoundToTwo((o.LoanApplication.serviceAmount * o.subvention / 100) + ((o.LoanApplication.serviceAmount * o.subvention / 100) * 18 / 100)),
                            processingFeeToCustomer: o.LoanApplication.processingFee,
                            processingFeeToPartnerAmount: rupeesRoundToTwo(o.LoanApplication.processingFeeToPartner / 1.18),
                            processingFeeToPartnerGST: rupeesRoundToTwo((o.LoanApplication.processingFeeToPartner / 1.18) * 0.18),
                            processingFeeToPartner: rupeesRoundToTwo(o.LoanApplication.processingFeeToPartner),
                            netDisbursement: rupeesRoundToTwo((o.PartnerPayments[0] ? o.PartnerPayments[0].initialPaymentAmount : 0) + (o.PartnerPayments[0] ? o.PartnerPayments[0].holdBackPaymentAmount : 0))
                        }
                        let subitmes = o.PartnerPayments.reduce((suba: any, subitem: any) => {
                            item.firstTrancheAmtDisbursed = subitem.initialPaymentAmount || '#N/A';
                            item.firstTrancheDisbursedDate = (subitem.holdBackPaymentDueDate ? moment(subitem.initialPaymentDueDate).utcOffset(parseInt(AVANSEOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A');
                            item.secondTrancheAmtDisbursed = subitem.holdBackPaymentAmount || '#N/A';
                            item.secondTrancheDisbursedDate = (subitem.holdBackPaymentDueDate ? moment(subitem.holdBackPaymentDueDate).utcOffset(parseInt(AVANSEOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A');
                            suba.push(item);
                            return suba;
                        }, []);
                        a = [...a, ...subitmes];
                        return a;
                    }, []);
                    // Create an excel instance and send the file to the client.
                    excelSheet.setCreator(APP_NAME)
                        .addSheet(columns1, avanserows, 'Loans')
                        .writeToDownloadStream(res, 'Loans');

                    break;

                case 3:
                    let abflSettings = await db.GlobalSetting.findOne({ where: { isActive: true } });
                    let abflColumns: Array<Column> = [
                        { header: 'Partner Application ID', key: 'applicationId', width: 15 },
                        { header: 'Approval Basis', key: 'approverComment', width: 10 },
                        { header: 'Catagory', key: 'sector', width: 15 },
                        { header: 'Programme Type', key: 'programmeType', width: 15 },
                        { header: 'Location', key: 'location', width: 15 },
                        { header: 'Center Branch Name', key: 'centerBranchName', width: 15 },
                        { header: 'Loan Amount', key: 'loanAmount', width: 15 },
                        { header: 'Scheme', key: 'model', width: 10 },
                        { header: 'Effective Tenure', key: 'residualEMI', width: 10 },
                        { header: 'Total Tenure', key: 'appliedLoanTerm', width: 10 },
                        { header: 'ROI %', key: 'interest', width: 10 },
                        { header: 'Advance payment To ABFL', key: 'dnToTcpl', width: 10 },
                        { header: 'Advance payment To Partner', key: 'dnToPartner', width: 10 },
                        { header: 'Loan Amt without Advance Payment', key: 'loanAmtWithoutAdv', width: 10 },
                        { header: 'Processing Fee To Customer(including GST)', key: 'processingFeeToCustomer', width: 10 },
                        { header: 'Processing Fee To Partner (including GST)', key: 'processingFeeToPartner', width: 10 },
                        { header: 'Actual Disbursement Amount', key: 'netDisbursement', width: 10 },
                        { header: 'EMI Amount', key: 'emiAmount', width: 10 },
                        { header: 'Subvention %', key: 'subvention', width: 10 },
                        { header: 'Subvention Amount', key: 'subventionAmt', width: 10 },
                        { header: 'GST On Subvention', key: 'gstOnSubvention', width: 10 },
                        { header: 'Subvention+GST', key: 'totalsubvention', width: 10 },
                        { header: 'Loan Applicant FullName', key: 'customerName', width: 20 },
                        { header: 'Gender', key: 'gender', width: 10 },
                        { header: 'DOB (DD-MM-YYYY)', key: 'dob', width: 10 },
                        { header: 'Pan Number', key: 'panNumber', width: 30 },
                        { header: 'Name As Pan', key: 'nameAsPan', width: 50 },
                        { header: 'Fathers Husband name', key: 'fatherName', width: 30 },
                        { header: 'Mothers maiden name', key: 'motherName', width: 30 },
                        { header: 'Marital status', key: 'maritalStatus', width: 30 },
                        { header: 'Student Name', key: 'serviceUserName', width: 20 },
                        { header: 'Email', key: 'email', width: 30 },
                        { header: 'Mobile', key: 'mobile', width: 30 },
                        { header: 'Current Address', key: 'residenceAddress', width: 30 },
                        { header: 'Pincode', key: 'residencePincode', width: 10 },
                        { header: 'Tier', key: 'tier', width: 10 },
                        { header: 'City', key: 'residenceCity', width: 10 },
                        { header: 'State', key: 'residenceState', width: 10 },
                        { header: 'Household Income', key: 'householdIncome', width: 10 },
                        { header: 'Employer Name', key: 'employerName', width: 10 },
                        { header: 'Employment Type', key: 'employmentType', width: 10 },
                        { header: 'Account holder Name', key: 'beneficiaryName', width: 10 },
                        { header: 'IFSC', key: 'ifsc', width: 10 },
                        { header: 'Bank Name', key: 'bank', width: 10 },
                        { header: 'Bank Account Number', key: 'bankAccNo', width: 10 },
                        { header: 'Type of account', key: 'typeOfAcc', width: 10 },
                        { header: 'Merchant Name', key: 'partnerName', width: 10 },
                        { header: 'Doctor Verification', key: 'doctorVerification', width: 10 },
                        { header: 'MFI Status', key: 'mfiStatus', width: 10 },
                        { header: 'Course Name', key: 'courseName', width: 10 },
                        { header: 'Course Tenure', key: 'courseTenure', width: 10 },
                        { header: 'University Name', key: 'universityName', width: 10 },
                        { header: 'Enrollment Id', key: 'serviceUserEnrollmentId', width: 10 }
                    ];

                    // Format the rows a little bit to fit into the excel
                    let abflRows = result.map((o: any) => {
                        const insuranceAmtToBeAddedToSanctionAmt = (o.LoanApplication.applyInsurance ? o.LoanApplication.insuranceAmount : 0);
                        let additionalProcessedData = Controller._partialProcessOfLoanDataForExcel(abflSettings.loanStartDay, o, abflSettings.gstPercentage, insuranceAmtToBeAddedToSanctionAmt);
                        return {
                            applicationId: o.LoanApplication.applicationNumber,
                            sector: o.LoanApplication.Branch.Partner.Service.Sector.name,
                            approverComment: o.LoanApplication.approverComment || '#N/A',
                            programmeType: "Ed-Tech",
                            location: o.LoanApplication.Branch.city,
                            centerBranchName: o.LoanApplication.Branch.name,
                            loanAmount: o.loanAmount,
                            ...additionalProcessedData,
                            appliedLoanTerm: o.LoanApplication.loanTerm || '#N/A',
                            interest: o.LoanApplication.interest,
                            loanAmtWithoutAdv: o.loanAmount - additionalProcessedData.dnToTcpl - additionalProcessedData.dnToPartner,
                            processingFeeToCustomer: o.LoanApplication.processingFee,
                            processingFeeToPartner: o.LoanApplication.processingFeeToPartner,
                            netDisbursement: rupeesRoundToTwo(o.PartnerPayments[0] ? o.PartnerPayments[0].initialPaymentAmount : 0),
                            emiAmount: rupeesRoundToTwo(o.LoanApplication.emiAmount),
                            subvention: o.subvention,
                            customerName: o.Customer.name,
                            gender: o.Customer.aadharGender,
                            dob: moment(o.Customer.dob).format('DD-MM-YYYY'),
                            panNumber: o.Customer.panNumber,
                            nameAsPan: o.Customer.Pans ? (o.Customer.Pans.status == 'VALID' ? o.Customer.Pans.fullName : "") : "#N/A",
                            fatherName: "N/A",
                            motherName: "N/A",
                            maritalStatus: "N/A",
                            serviceUserName: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : ((o.LoanApplication.serviceUserSalutation) + (o.LoanApplication.serviceUserFirstName) + (o.LoanApplication.serviceUserLastName)),
                            email: o.Customer.email,
                            mobile: o.Customer.mobile,
                            residenceAddress: o.Customer.residentAddress || '#N/A',
                            residencePincode: o.Customer.residentPincode || '#N/A',
                            tier: '#N/A',
                            residenceCity: o.Customer.residentCity || '#N/A',
                            residenceState: o.Customer.residentState || '#N/A',
                            householdIncome: o.Customer.monthlyIncome || '#N/A',
                            employerName: o.Customer.employer || '#N/A',
                            employmentType: o.Customer.employmentType || '#N/A',
                            beneficiaryName: o.RazorPayMandateDetail ? o.RazorPayMandateDetail.beneficiaryName : '#N/A',
                            ifsc: o.RazorPayMandateDetail ? o.RazorPayMandateDetail.ifsc : '#N/A',
                            bank: o.RazorPayMandateDetail ? o.RazorPayMandateDetail.bank : '#N/A',
                            bankAccNo: o.RazorPayMandateDetail ? o.RazorPayMandateDetail.accountNumber : '#N/A',
                            typeOfAcc: o.RazorPayMandateDetail ? o.RazorPayMandateDetail.accountType : '#N/A',
                            partnerName: o.LoanApplication.Branch.Partner.name,
                            doctorVerification: "N/A",
                            mfiStatus: "N/A",
                            courseName: o.LoanApplication.courseName || '#N/A',
                            courseTenure: o.LoanApplication.courseTenure || '#N/A',
                            universityName: o.LoanApplication.universityName || '#N/A',
                            serviceUserEnrollmentId: o.LoanApplication.serviceUserEnrollmentId || '#N/A',
                        }
                    });
                    // Create an excel instance and send the file to the client.
                    excelSheet.setCreator(APP_NAME)
                        .addSheet(abflColumns, abflRows, 'Loans')
                        .writeToDownloadStream(res, 'Loans');
                    break;

                default:
                    let defaultSettings = await db.GlobalSetting.findOne({ where: { isActive: true } });
                    let defaultColumns: Array<Column> = [
                        { header: 'Application ID', key: 'applicationId', width: 15 },
                        { header: 'Application Date', key: 'applicationDate', width: 15 },
                        { header: 'Approved Date', key: 'approvedDate', width: 15 },
                        { header: 'Applied Loan Amount (Rs)', key: 'appliedLoanAmount', width: 10 },
                        { header: 'Approved Loan Amount (Rs)', key: 'approvedLoanAmount', width: 10 },
                        { header: 'Bureau Score(Hard)', key: 'bureauScore', width: 20 },
                        { header: 'Bureau Score(Soft)', key: 'bureauScoreSoft', width: 20 },
                        { header: 'TCPL Credit Score', key: 'tcplCreditScore', width: 10 },
                        { header: 'Original Category', key: 'originalCategory', width: 10 },
                        { header: 'Revised Category', key: 'revisedCategory', width: 10 },
                        { header: 'Applied Tenure (Months)', key: 'appliedLoanTerm', width: 10 },
                        { header: 'Approved Tenure (Months)', key: 'approvedLoanTerm', width: 10 },
                        { header: 'Approved By', key: 'approverName', width: 10 },
                        { header: 'Approver Comment', key: 'approverComment', width: 10 },
                        { header: 'Upgrade By', key: 'upgradeBy', width: 10 },
                        { header: 'Verified By', key: 'verifiedBy', width: 10 },
                        { header: 'Verifier Comment', key: 'verifierComment', width: 10 },
                        { header: 'Verified At', key: 'verifiedAt', width: 10 },
                        { header: 'Emandate Waived By', key: 'emandateWaivedBy', width: 10 },
                        { header: 'Organization', key: 'organization', width: 30 },
                        { header: 'Upgrade Comment', key: 'upgradeComment', width: 10 },
                        { header: 'Customer ID', key: 'customerId', width: 25 },
                        { header: 'Loan ID', key: 'id', width: 25 },
                        { header: 'Loan Creation Date', key: 'createdAt', width: 15 },
                        { header: 'Customer Name', key: 'customerName', width: 20 },
                        { header: 'Gender', key: 'gender', width: 10 },
                        { header: 'DOB (DD-MM-YYYY)', key: 'dob', width: 10 },
                        { header: 'Age', key: 'age', width: 10 },
                        { header: 'Email', key: 'email', width: 30 },
                        { header: 'Mobile', key: 'mobile', width: 30 },
                        { header: 'Alternate Mobile', key: 'alternateMobile', width: 30 },
                        { header: 'Pan Number', key: 'panNumber', width: 30 },
                        { header: 'Name As Pan', key: 'nameAsPan', width: 50 },
                        { header: 'Service User Name', key: 'serviceUserName', width: 20 },
                        { header: 'Service User Relationship', key: 'serviceUserRelationship', width: 20 },
                        { header: 'Service User Email', key: 'serviceUserEmail', width: 30 },
                        { header: 'Fathers Husband name', key: 'fatherhusbandName', width: 30 },
                        { header: 'Marital status', key: 'maritalStatus', width: 30 },
                        { header: 'Permanent Address', key: 'permanentAddress', width: 30 },
                        { header: 'Permanent Pin Code', key: 'permanentPincode', width: 10 },
                        { header: 'Permanent City', key: 'permanentCity', width: 10 },
                        { header: 'Permanent State', key: 'permanentState', width: 10 },
                        { header: 'Residence Address', key: 'residenceAddress', width: 30 },
                        { header: 'Residence Pin Code', key: 'residencePincode', width: 10 },
                        { header: 'Residence City', key: 'residenceCity', width: 10 },
                        { header: 'Residence State', key: 'residenceState', width: 10 },
                        { header: 'Employment Type', key: 'employmentType', width: 10 },
                        { header: 'Employer Name', key: 'employerName', width: 10 },
                        { header: 'Household Income', key: 'householdIncome', width: 10 },
                        { header: 'Sector', key: 'sector', width: 10 },
                        { header: 'Service', key: 'service', width: 10 },
                        { header: 'Partner', key: 'partner', width: 30 },
                        { header: 'Beneficiary Name', key: 'beneficiaryName', width: 30 },
                        { header: 'Branch', key: 'location', width: 10 },
                        { header: 'Service Amount', key: 'serviceAmount', width: 15 },
                        { header: 'Loan Amount', key: 'loanAmount', width: 15 },
                        { header: 'Insurance', key: 'insurance', width: 10 },
                        { header: 'EMI', key: 'emi', width: 10 },
                        { header: 'Model', key: 'model', width: 10 },
                        { header: 'Residual EMI', key: 'residualEMI', width: 10 },
                        { header: 'Emandate Done', key: 'emandate', width: 10 },
                        { header: 'Emandate Partner', key: 'emandatePartner', width: 10 },
                        { header: 'Down payment To TCPL', key: 'dnToTcpl', width: 10 },
                        { header: 'Paid down payment To TCPL', key: 'dnPaid', width: 10 },
                        { header: 'Down payment To Partner', key: 'dnToPartner', width: 10 },
                        { header: 'Net Loan Amount (Include Insurance Amount)', key: 'sanctionAmt', width: 10 },
                        { header: 'No Of EMI Paid ', key: 'emiPaid', width: 10 },
                        { header: 'No Of EMI Due', key: 'emiDue', width: 10 },
                        { header: 'No Of EMI Over Due', key: 'emiOverDue', width: 10 },
                        { header: 'Delinquent', key: 'delinquent', width: 10 },
                        { header: 'EMI Amount Due', key: 'emiAmountDue', width: 10 },
                        { header: 'EMI Amount Paid', key: 'emiAmountPaid', width: 10 },
                        { header: 'Penal Pending', key: 'penalPending', width: 10 },
                        { header: 'Bounce Pending', key: 'bouncePending', width: 10 },
                        { header: 'POS', key: 'pos', width: 10 },
                        { header: 'Interest %', key: 'interest', width: 10 },
                        { header: 'Subvention %', key: 'subvention', width: 10 },
                        { header: 'Subvention Amount', key: 'subventionAmt', width: 10 },
                        { header: 'GST On Subvention', key: 'gstOnSubvention', width: 10 },
                        { header: 'Subvention+GST', key: 'totalsubvention', width: 10 },
                        { header: 'Processing Fee To TCPL', key: 'processingFeeToCustomer', width: 10 },
                        { header: 'Processing Fee To Partner', key: 'processingFeeToPartner', width: 10 },
                        { header: 'Net Disbursement', key: 'netDisbursement', width: 10 },
                        { header: 'Date Of Disbursement', key: 'dateofDisbursement', width: 10 },
                        { header: 'Holdback Amount', key: "holdbackAmount", width: 10 },
                        { header: 'Holdback Payment Status', key: "holdbackPaymentStatus", width: 10 },
                        { header: 'EMI Start Date(DD-MM-YYYY)', key: 'emiStartDate', width: 10 },
                        { header: 'EMI End Date(DD-MM-YYYY)', key: 'emiEndDate', width: 10 },
                        { header: 'Status', key: 'status', width: 20 },
                        { header: 'Loan Status', key: 'loanStatus', width: 20 },
                        { header: 'Close / Cancel Remarks', key: 'closeCancelRemarks', width: 100 },
                        { header: 'Close Initiator', key: 'closeInitiator', width: 10 },
                        { header: 'Close Approver', key: 'closeApprover', width: 10 },
                        { header: 'Enach Token Id', key: 'eNachToken', width: 20 },
                        { header: 'Razorpay Customer Id', key: 'razorPayCustomerId', width: 20 },
                        { header: 'Partner Payment Disbursment UTR', key: 'partnerPaymentUTR', width: 20 },
                        { header: 'Subvention Amt UTR, Paid by Partner-TCPL', key: 'subventionPaidByPartner', width: 25 },
                        { header: 'Invoice Present', key: 'invoice', width: 20 },
                        { header: 'KYC Completed', key: 'kycCompleted', width: 20 },
                        { header: 'KYC Mode', key: 'kyc', width: 20 },
                        { header: 'Hypothecation', key: 'hypothecation', width: 20 },
                        { header: 'Course Name', key: 'courseName', width: 20 },
                        { header: 'Course Tenure', key: 'courseTenure', width: 20 },
                        { header: 'University Name', key: 'universityName', width: 20 },
                        { header: 'Enrollment Id', key: 'serviceUserEnrollmentId', width: 20 },
                        { header: 'subAmountPaidDate', key: 'subAmountPaidDate', width: 20 },
                        { header: 'subAmountUtr', key: 'subAmountUtr', width: 20 },
                        { header: 'subAmountRemark', key: 'subAmountRemark', width: 20 },
                        { header: 'Partner IRR', key: 'pIrr', width: 20 },
                        //{ header: 'Partner XIRR', key: 'pXirr', width: 20 },
                        { header: 'Partner IRR with PF', key: 'pfIrr', width: 20 },
                        //{ header: 'Partner XIRR with PF', key: 'pfXirr', width: 20 }
                    ];

                    const DEFAULTOFFSET = process.env.SERVER_DEFAULT_OFFSET || '0';
                    // Format the rows a little bit to fit into the excel
                    let defaultRows = result.map((o: any) => {
                        const insuranceAmtToBeAddedToSanctionAmt = (o.LoanApplication.applyInsurance ? o.LoanApplication.insuranceAmount : 0);
                        let additionalProcessedData = Controller._partialProcessOfLoanDataForExcel(defaultSettings.loanStartDay, o, defaultSettings.gstPercentage, insuranceAmtToBeAddedToSanctionAmt);
                        let closerInitiator = null;
                        let closerApprover = null;
                        if (o.CloseLoanState) {
                            closerInitiator = o.CloseLoanState.reduce((oCLS, a) => { if (a.closureType == 'CANCEL') return a; }, null);
                            closerApprover = o.CloseLoanState.reduce((oCLS, a) => { if (a.closureType == 'CLOSE') return a; }, null);
                        }

                        return {
                            applicationId: o.LoanApplication.applicationNumber,
                            applicationDate: (o.LoanApplication.createdAt ? moment(o.LoanApplication.createdAt).utcOffset(parseInt(DEFAULTOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A'),
                            approvedDate: (o.LoanApplication.approvedAt ? moment(o.LoanApplication.approvedAt).utcOffset(parseInt(DEFAULTOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A'),
                            appliedLoanAmount: o.LoanApplication.oldLoanAmount || '#N/A',
                            approvedLoanAmount: o.LoanApplication.serviceAmount || '#N/A',
                            bureauScore: o.Customer.cibilScore || '#N/A',
                            bureauScoreSoft: o.Customer.softCibilScore || '#N/A',
                            tcplCreditScore: o.Customer.tcplScore || '#N/A',
                            originalCategory: o.Customer.oldCategory || '#N/A',
                            revisedCategory: o.Customer.category || '#N/A',
                            appliedLoanTerm: o.LoanApplication.oldLoanTerm || '#N/A',
                            approvedLoanTerm: o.LoanApplication.loanTerm || '#N/A',
                            approverName: o.LoanApplication.approverName || '#N/A',
                            approverComment: o.LoanApplication.approverComment || '#N/A',
                            emandateWaivedBy: o.LoanApplication.mandateWaivedBy || '#N/A',
                            upgradeBy: o.LoanApplication.upgradedBy || '#N/A',
                            upgradeComment: o.LoanApplication.upgraderComment || '#N/A',
                            verifiedBy: o.isVerifiedBy,
                            verifierComment: o.isVerified || "#N/A",
                            verifiedAt: (o.isVerifiedAt ? moment(o.isVerifiedAt).utcOffset(parseInt(DEFAULTOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A'),
                            customerId: o.Customer.customerId,
                            id: o.loanNumber,
                            createdAt: (o.createdAt ? moment(o.createdAt).utcOffset(parseInt(DEFAULTOFFSET)).format('DD-MM-YYYY hh:mm A') : '#N/A'),
                            customerName: o.Customer.name,
                            gender: o.Customer.aadharGender,
                            dob: moment(o.Customer.dob).format('DD-MM-YYYY'),
                            age: calculateAge(o.Customer.dob),
                            email: o.Customer.email,
                            mobile: o.Customer.mobile,
                            alternateMobile: o.Customer.alternateMobile || '#N/A',
                            panNumber: o.Customer.panNumber,
                            nameAsPan: o.Customer.Pans ? (o.Customer.Pans.status == 'VALID' ? o.Customer.Pans.fullName : "") : "#N/A",
                            serviceUserName: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : ((o.LoanApplication.serviceUserSalutation) + (o.LoanApplication.serviceUserFirstName) + (o.LoanApplication.serviceUserLastName)),
                            serviceUserRelationship: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : o.LoanApplication.serviceUserRelationship,
                            serviceUserEmail: o.LoanApplication.personTakingSameAsPersonUsing ? '#N/A' : o.LoanApplication.serviceUserEmail,
                            fatherhusbandName: o.Customer.fatherhusbandName || '#N/A',
                            maritalStatus: o.Customer.maritalStatus || '#N/A',
                            permanentAddress: o.Customer.address,
                            permanentPincode: o.Customer.pincode,
                            permanentCity: o.Customer.city,
                            permanentState: o.Customer.state,
                            residenceAddress: o.Customer.residentAddress || '#N/A',
                            residencePincode: o.Customer.residentPincode || '#N/A',
                            residenceCity: o.Customer.residentCity || '#N/A',
                            residenceState: o.Customer.residentState || '#N/A',
                            employmentType: o.Customer.employmentType || '#N/A',
                            employerName: o.Customer.employer || '#N/A',
                            householdIncome: o.Customer.monthlyIncome || '#N/A',
                            sector: o.LoanApplication.Branch.Partner.Service.Sector.name,
                            organization: o.LoanApplication.Organization ? o.LoanApplication.Organization.name : '#N/A',
                            service: o.LoanApplication.Branch.Partner.Service.name,
                            location: o.LoanApplication.Branch.name,
                            partner: o.LoanApplication.Branch.Partner.name,
                            beneficiaryName: o.LoanApplication.Branch.beneficiaryName,
                            loanAmount: o.loanAmount,
                            insurance: o.LoanApplication.applyInsurance ? o.LoanApplication.insuranceAmount : 0,
                            emandate: o.eNachToken && o.LoanApplication.emandate ? 'YES - ' + o.LoanApplication.emandate : o.eNachToken &&
                                !o.LoanApplication.emandate || o.digioUmrn ? 'YES' : 'NO',
                            emi: rupeesRoundToTwo(o.emiAmount),
                            emandatePartner: o.LoanApplication.emandate ? o.LoanApplication.eMandatePartner : "NO",
                            dnPaid: o.customerPayments && o.customerPayments[0].paymentType == 1 ? "Yes" : 'No',
                            interest: o.LoanApplication.interest,
                            emiAmountDue: rupeesRoundToTwo(o.emiAmount),
                            emiAmountPaid: rupeesRoundToTwo(o.paymentsReceived),
                            penalPending: o.totalPenaltyCharges,
                            bouncePending: o.totalBounceCharges,
                            //emiPending:o.installments[0].paymentPending,
                            subvention: o.subvention,
                            pos: rupeesRoundToTwo(o.outstandingAmount),
                            processingFeeToCustomer: o.LoanApplication.processingFee,
                            processingFeeToPartner: o.LoanApplication.processingFeeToPartner,
                            gstOnProcessingFee: 0,
                            netDisbursement: o.PartnerPayments && o.PartnerPayments.length ? rupeesRoundToTwo(o.PartnerPayments[0] ? o.PartnerPayments[0].initialPaymentAmount : 0) : '#N/A',
                            dateofDisbursement: (o.disbursedAt ? (moment(o.disbursedAt).utcOffset(parseInt(DEFAULTOFFSET)).format('DD-MM-YYYY hh:mm A')) : '#N/A'), holdbackAmount: o.PartnerPayments && o.PartnerPayments.length ? rupeesRoundToTwo(o.PartnerPayments[0] ? o.PartnerPayments[0].holdBackPaymentAmount : 0) : '#N/A',
                            holdbackPaymentStatus: o.PartnerPayments && o.PartnerPayments.length ? (o.PartnerPayments[0]
                                ? (o.PartnerPayments[0].holdBackPaymentID ? 'Paid' : 'Not Paid') : 'Not Paid') : '#N/A',
                            ...additionalProcessedData,
                            status: !o.subStatus ? o.status : o.status + '-' + o.subStatus,
                            loanStatus: o.loanStatus,
                            closeCancelRemarks: o.closeCancelRemarks || '#N/A',
                            closeInitiator: closerInitiator ? closerInitiator.User.firstName + ' ' + closerInitiator.User.lastName : '',
                            closeApprover: closerApprover ? closerApprover.User.firstName + ' ' + closerApprover.User.lastName : '',
                            eNachToken: o.eNachToken || '#N/A',
                            razorPayCustomerId: o.Customer.razorPayCustomerId || '#N/A',
                            partnerPaymentUTR: o.LoanPaymentAdvicetoPartner ? o.LoanPaymentAdvicetoPartner.fundTransferReferenceId : '#N/A',
                            subventionPaidByPartner: o.subAmountUtr || '#N/A',
                            invoice: o.LoanApplication.pathToInvoiceS3 ? 'Yes' : 'No',
                            kycCompleted: o.LoanApplication.kycCompleted ? 'Yes' : 'No',
                            kyc: o.Customer.cKycRecordPath ? 'CKYC' : o.Customer.eKyc ? 'eKyc' : '',
                            hypothecation: o.BankerLoan ? o.BankerLoan.banker : '#N/A',
                            courseName: o.LoanApplication.courseName || '#N/A',
                            courseTenure: o.LoanApplication.courseTenure || '#N/A',
                            universityName: o.LoanApplication.universityName || '#N/A',
                            serviceUserEnrollmentId: o.LoanApplication.serviceUserEnrollmentId || '#N/A',
                            subAmountPaidDate: o.subAmountPaidDate ? moment(o.subAmountPaidDate).format('DD-MM-YYYY') : '#N/A',
                            subAmountUtr: o.subAmountUtr || '#N/A',
                            subAmountRemark: o.subAmountRemark || '#N/A',
                            serviceAmount: o.LoanApplication.serviceAmount,
                            pIrr: o.pIrr,
                            //pXirr: o.pXirr,
                            pfIrr: o.pfIrr
                            //pfXirr: o.pfXirr
                        }
                    });
                    // Create an excel instance and send the file to the client.
                    excelSheet.setCreator(APP_NAME)
                        .addSheet(defaultColumns, defaultRows, 'Loans')
                        .writeToDownloadStream(res, 'Loans');
            }
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Private common method to fetch all the loans from the database applying search, filter, pagination, sorting
     * @param req
     * @param paginate
     * @private
     */
    private static async _getList(req: Request, paginate: boolean = true, excludeLoanEmis: boolean = false) {
        // Set the limit
        let limit: any = paginate ? getLimitFromRequest(req) : false;

        let filter: any = { where: {}, order: [['id', 'DESC']] };

        let filterByAccess: any = {};

        // Apply org level filter
        if (req.user.organizationId && (req.user.organizationId) !== 1) {
            filter.where.organizationId = req.user.organizationId;
        }
        // Apply filters conditionally based on the user type
        if (req.user.role) {

            // If SuperAdmin is logged in, set the organization id to the logged in user's as per employee roles
            if (req.user.role === 'SYSTEM_ADMIN') {
                if (isDefined(req.query['partner'], true)) filterByAccess.partner = req.query['partner'];
                if (isDefined(req.query['branch'], true)) filterByAccess.branch = req.query['branch'];
                if ((req.user.organizationId) !== 1) {
                    filter.where.organizationId = req.user.organizationId;
                }
            }
            // If customer is logged in, set the consumer id to the logged in user's customer id
            if (req.user.role === 'CUSTOMER') {
                filter.where.consumer = req.user.id;
            } else if (['BRANCH_ADMIN', 'BRANCH_OWNER'].indexOf(req.user.role) !== -1) {
                filter.where['$LoanApplication.hold$'] = { [db.sequelize.Op.not]: true };
                
                // add branch and partner filter if the logged in user's role is BRANCH
                filterByAccess.partner = await Controller._getSubPartnerList(req.user.partnerId);
                filterByAccess.branch = await Controller._getSubBranchList(req.user.branchId);
            } else if (['SYSTEM_ADMIN', 'PROMOTER'].indexOf(req.user.role) !== -1) {
                // let the admin pass in any filter
                if (isDefined(req.query['partner'], true)) filterByAccess.partner = req.query['partner'];
                if (isDefined(req.query['branch'], true)) filterByAccess.branch = req.query['branch'];
                //if (isDefined(req.query['service'], true)) filterByAccess.service = req.query['service'];
                //if (isDefined(req.query['sector'], true)) filterByAccess.sector = req.query['sector'];

                if (isDefined(req.query['customer'], true)) filter.where.consumer = req.query['customer'];
            } else if (req.user.role === 'PARTNER') {
                if(!req.user.partnerId){
                    return [];
                }
                filter.where['$LoanApplication.hold$'] = { [db.sequelize.Op.not]: true };
                // If the requested user is a partner, pre apply the partner = requested user id
                filterByAccess.partner = await Controller._getSubPartnerList(req.user.partnerId);
                // Fetch the loan application
                // Apply the branch id filter if the user has provided it.
                if (isDefined(req.query['branch'], true)) filterByAccess.branch = await Controller._getSubBranchList(req.query['branch']);

                if (isDefined(req.query['customer'], true)) filter.where.consumer = req.query['customer'];
            }
        } else {
            return [];
        }

        // Apply the status filter.
        if (isDefined(req.query.status, true) && ["active", "delinquent", "closed", "cancelled"].indexOf(req.query.status) !== -1) {
            filter.where.status = req.query.status;
        }

        // For deferent tabs
        if (isDefined(req.query.loanStatus, true)) {
            if (req.query.loanStatus == "toVerify") {
                filter.where.isVerified = { [db.Sequelize.Op.is]: null };
                filter.where['$LoanApplication.termsConditionsAccepted$'] = 1;
                filter.where.status = "active";
                filter.where.loanStatus = "PROCESSED";
            }

            if (req.query.loanStatus == "toDisburse") {
                filter.where.isVerified = { [db.Sequelize.Op.not]: null };
                filter.where.status = "active";
                filter.where.loanStatus = "PROCESSED";
            }

            if (req.query.loanStatus == "CLOSURE_INITIATED") {
                filter.where.subStatus = { [db.Sequelize.Op.is]: null };
                filter.where.status = req.query.status;
                filter.where.subStatus = "CLOSURE_INITIATED";
            }

            if (req.query.loanStatus == "docsPending") {
                filter.where.docsPending = { [db.Sequelize.Op.not]: null };
                filter.where.status = "active";
                filter.where.loanStatus = "DOCSPENDING";
            }

            if (req.query.loanStatus == "running") {
                filter.where.status = {
                    [db.Sequelize.Op.or]: ["active", "delinquent"]
                }
                filter.where.loanStatus = "DISBURSED";
            }

            if (req.query.loanStatus == "closed") {
                filter.where.status = "closed";
            }

            if (req.query.loanStatus == "cancelledOrRejected") {
                filter.where[db.Sequelize.Op.or] = [{
                    status: "cancelled"
                }, {
                    "$LoanApplication.applicationStatus$": {
                        [db.Sequelize.Op.or]: [APPLICATION_STATE.REJECTED, APPLICATION_STATE.CANCELLED]
                    }
                }];
            }
        }
        // Sort column. example ?sort=name,asc
        if (isDefined(req.query.sort, true)) {
            let orderBy = req.query.sort.split(',');
            let validSortFields = {
                id: ['id'],
                outstandingAmount: ['principalOutstanding'],
                disbursedDate: ['createdAt'],
                loanAmount: 'LoanApplication.loanAmount',
                branchName: 'LoanApplication.Branch.name',
                partnerName: 'LoanApplication.Branch.Partner.name',
                serviceName: 'LoanApplication.Branch.Partner.Service.name',
                customerId: 'Customer.id',
                tenure: 'LoanApplication.loanTerm',
                customerName: 'Customer.name',
                paymentsReceived: 'paymentsReceived',
            };

            if (orderBy.length === 2 && validSortFields.hasOwnProperty(orderBy[0])
                && ['ASC', 'DESC'].indexOf(orderBy[1].toUpperCase()) !== -1) {
                if (['loanAmount', 'branchName', 'partnerName', 'serviceName', 'customerId', 'tenure', 'customerName', 'paymentsReceived'].indexOf(orderBy[0]) !== -1) {
                    filter.order = db.sequelize.literal(`\`${validSortFields[orderBy[0]]}\` ${orderBy[1]}`);
                } else {
                    filter.order = [[...validSortFields[orderBy[0]], orderBy[1]]];
                }
            }
        }

        // Loans search filter optimization.
        // if (isDefined(req.query.q) && req.query.q !== '') {
        //     //  Info - Git #419 removed other search options as of requirement and we can get back if reqired
        //     // let fields = ['$Customer.fullName$', '$Loan.loanNumber$', '$LoanApplication.applicationNumber$', '$Customer.email$', '$Customer.mobile$', '$Customer.alternateMobile$'];

        //     let fields = ['$Loan.loanNumber$', '$Customer.email$', '$Customer.mobile$', '$Customer.fullName$'];

        //     // Loops through the array and create a filter object for each field.
        //     filter.where[db.Sequelize.Op.or] = fields.reduce((object, item) => {
        //         object[item] = { [db.Sequelize.Op.eq]: (req.query.q) };
        //         return object;
        //     }, {});
        // }

        let fields = {
            'loanNumber': '$Loan.loanNumber$',
            'applicationNumber': '$LoanApplication.applicationNumber$',
            'email': '$Customer.email$',
            'mobile': '$Customer.mobile$',
            'fullName': '$Customer.fullName$'
        };

        if (isDefined(req.query.q) && req.query.q !== '' && !isDefined(req.query.qf)) {
            req.query.qf = 'loanNumber';
        }

        // Apply the date filter
        for (let field in fields) {
            if (isDefined(req.query.q) && req.query.q !== '' && req.query.qf == field) {
                filter.where[fields[field]] = parseInput(fields[field], req.query.q, "like");
            } else if (isDefined(req.query[field], true)) {
                filter.where[fields[field]] = parseInput(fields[field], req.query[field]);
            }
        }

        // Apply the date filter
        let datefields = {
            'loanBooking': '$Loan.createdAt$',
            'loanApplication': '$LoanApplication.createdAt$',
            'disburseDate': '$Loan.disbursedAt$',
            'cancelDate': '$Loan.closedAt$'
        };

        let dateFilter = '$Loan.createdAt$';
        if (isDefined(req.query.bydate, true)) {
            dateFilter = datefields[req.query.bydate];
        }

        if (isDefined(req.query.startDate, true) && !isDefined(req.query.endDate, true)) {
            filter.where[dateFilter] = { [db.sequelize.Op.gte]: req.query.startDate }
        }
        if (!isDefined(req.query.startDate, true) && isDefined(req.query.endDate, true)) {
            filter.where[dateFilter] = { [db.sequelize.Op.lte]: req.query.endDate }
        }
        if (isDefined(req.query.startDate, true) && isDefined(req.query.endDate, true)) {
            filter.where[dateFilter] = { [db.Sequelize.Op.between]: [req.query.startDate, req.query.endDate] }
        }

        // Apply the amount filter
        if (isDefined(req.query.startAmount, true) && !isDefined(req.query.endAmount, true)) {
            filter.where['$LoanApplication.loanAmount$'] = { [db.sequelize.Op.gt]: req.query.startAmount }
        }
        if (!isDefined(!req.query.startAmount, true) && isDefined(req.query.endAmount, true)) {
            filter.where['$LoanApplication.loanAmount$'] = { [db.sequelize.Op.lt]: req.query.endAmount }
        }
        if (isDefined(req.query.startAmount, true) && isDefined(req.query.endAmount, true)) {
            filter.where['$LoanApplication.loanAmount$'] = { [db.Sequelize.Op.between]: [req.query.startAmount, req.query.endAmount] }
        }

        let attributes = [];

        if (isDefined(req.query.defaultedEmiRangeStart, true) || isDefined(req.query.defaultedEmiRangeEnd, true)) {
            filter.where.status = {
                [db.Sequelize.Op.in]: ['active', 'delinquent']
            };
            attributes.push([db.sequelize.literal(`(select DATEDIFF(CURRENT_DATE(), LoanEmis.dueDate)
            from LoanEmis
            where LoanEmis.loanId = Loan.id AND (LoanEmis.status = 'Not Paid' || (LoanEmis.status = 'Partially Paid' AND current_date() >= LoanEmis.dueDate))
            order by LoanEmis.dueDate ASC
            LIMIT 1)`), 'diff']);
        }
        // Defaulted EMI Collection filter
        if (!isDefined(req.query.defaultedEmiRangeStart, true) && isDefined(req.query.defaultedEmiRangeEnd, true)) {
            filter.having = {
                "$diff$": {
                    [db.Sequelize.Op.lt]: req.query.defaultedEmiRangeEnd
                }
            };
        }
        if (isDefined(req.query.defaultedEmiRangeStart, true) && isDefined(req.query.defaultedEmiRangeEnd, true)) {
            filter.having = {
                [db.Sequelize.Op.and]: [{
                    "$diff$": {
                        [db.Sequelize.Op.gte]: req.query.defaultedEmiRangeStart
                    },
                }, {
                    "$diff$": {
                        [db.Sequelize.Op.lt]: req.query.defaultedEmiRangeEnd
                    },
                }]

            };
        }
        if (isDefined(req.query.defaultedEmiRangeStart, true) && !isDefined(req.query.defaultedEmiRangeEnd, true)) {
            filter.having = {
                "$diff$": {
                    [db.Sequelize.Op.gte]: req.query.defaultedEmiRangeStart
                }
            };
        }

        filter.include = [{
            model: db.PartnerPayments
        }, {
            model: db.Customer,
            attributes: {
                exclude: [
                    "password",
                    "salt",
                    "cibilLastChecked",
                    "updatedAt",
                    "creditReport"
                ],
                include: [
                    ['fullName', 'name']
                ]
            },
            required: true
        }, {
            model: db.LoanApplication,
            required: true,
            include: [{
                model: db.Branch,
                required: true,
                attributes: ['id', 'name', 'branch', 'accountNumber', 'bank', 'ifsc'],
                include: [{
                    model: db.Partner,
                    required: true,
                    attributes: ['name'],
                    include: [{
                        model: db.Service,
                        required: true,
                        attributes: ['name'],
                        include: [{
                            model: db.Sector,
                            attributes: ['name'],
                            required: true
                        }]
                    }]
                }, {
                    model: db.BranchLoanSetting,
                    required: true,
                    attributes: ["interest"]
                }]
            }, {
                model: db.User,
                attributes: ['firstName', 'lastName'],
                required: false
            }, {
                model: db.Organization,
                attributes: ['name', 'bounceCharges'],
                required: false
            },
            adminiCreatedBy("LoanApplication"),
            adminiUpdatedBy("LoanApplication")],
            attributes: {
                exclude: ['accessToken']
            }
        }, {
            model: db.CloseLoanState,
            attributes: ["id", "user", "closureType", "requestorType", "remark", "isRejected", "actionDate"],
            include: [{
                model: db.User,
                attributes: ['id', 'firstName', 'lastName']
            }]
        }, {
            model: db.BankerLoan,
            attributes: ["id", "loanNumber", "banker"]
        }];


        // GIT 421 - Due to performance issues, LoanEmis has been dropped 
        if (!excludeLoanEmis) {
            filter.include.push({
                model: db.LoanEmi,
                required: false,
            });
        }

        let branchPartner = {
            'partner': '$LoanApplication.Branch.partner$',
            'branch': '$LoanApplication.branchId$'
        };

        ['sector', 'service', 'partner', 'branch'].forEach(item => {
            if (isDefined(filterByAccess[item], true)) {
                if (typeof filterByAccess[item] == "string" || typeof filterByAccess[item] == "number") {
                    filter.where[branchPartner[item]] = filterByAccess[item];
                } else {
                    filter.where[branchPartner[item]] = { [db.sequelize.Op.in]: filterByAccess[item] };
                }
            }
        });

        let args = [];
        /*
        ['sector', 'service', 'partner', 'branch'].forEach(item => {
            if (isDefined(filterByAccess[item], true)) {
                args.push(db.sequelize.where(
                    db.sequelize.col(`SectorServicePartnerBranchView.${item}`),
                    db.sequelize.literal(filterByAccess[item]),
                ));
            }
        });

        // Attach the count query to the main sequelize query
        if (args.length) {
            filter.where.id = {
                [db.sequelize.Op.in]: db.sequelize.literal(parenthesis(db.sequelize.dialect.QueryGenerator.selectQuery('SectorServicePartnerBranchView', {
                    where: db.sequelize.and(...args),
                    attributes: ['loan']
                }).slice(0, -1)))
            };
        }
        */

        filter.attributes = {
            include: [
                [db.sequelize.literal(parenthesis(`Loan.principalOutstanding`)), 'outstandingAmount'],
                [db.sequelize.literal(parenthesis(`Loan.loanAmount - Loan.principalOutstanding`)), 'paymentsReceived'],
                ...attributes
            ]
        };

        let records: any = {};
        let loanIds: any = [];
        let customerIds: any = [];
            
        if (isDefined(req.params.id)) {
            filter.where.id = req.params.id;
            records = db.Loan.findOne(filter);
            if (records) {
                records = records.toJSON();
                loanIds.push(req.params.id);
                if (records.Customer && records.Customer.id) {
                    customerIds.push(records.Customer.id);
                }
            }
        }

        if (!paginate) {
            records = await db.Loan.findAll(filter);
        } else {
            // Apply the limit.
            if (limit) filter.limit = limit;
            let page = 1;
            if (limit && isDefined(req.query.page, true) && !isNaN(req.query.page)) {
                page = parseInt(req.query.page);
                if (page > 1) filter.offset = (page - 1) * limit;
            }
            records = await db.Loan.findAll(filter);
        }
        if (records.length) {
            records = records.map(o => {
                o = o.toJSON();
                loanIds.push(o.id);
                customerIds.push(o.Customer.id);
                return o;
            });
        }

        let loanPaymentAdviceToPartner = await db.LoanPaymentAdviceToPartner.findAll({
            attributes: ["id", "fundTransferReferenceId", "loanId"],
            where: { loanId: { [db.Sequelize.Op.in]: loanIds } }
        });
        
        loanPaymentAdviceToPartner = loanPaymentAdviceToPartner.reduce((a, o) => {
            o = o.toJSON();
            a[o.loanId] = o;
            return a;
        }, {});

        let pans: any = await db.Pan.findAll({
            attributes: ['id', 'status', 'fullName', 'customerId', 'createdAt'],
            where: { customerId: { [db.Sequelize.Op.in]: customerIds } }
        });
        pans = pans.reduce((a, o) => {
            o = o.toJSON();
            a[o.customerId] = o;
            return a;
        }, {});

        let digioEkycRequests: any = await db.DigioEkycRequests.findAll({
            attributes: ['id', 'customerId'],
            where: { customerId: { [db.Sequelize.Op.in]: customerIds } }
        });
        digioEkycRequests = digioEkycRequests.reduce((a, o) => {
            o = o.toJSON();
            a[o.customerId] = o;
            return a;
        }, {});

        let customerEKycs: any = await db.CustomerEKycs.findAll({
            attributes: ['id', 'customerId'],
            where: { customerId: { [db.Sequelize.Op.in]: customerIds } }
        });
        customerEKycs = customerEKycs.reduce((a, o) => {
            o = o.toJSON();
            a[o.customerId] = o;
            return a;
        }, {});

        if (records.length) {
            for (let item of records) {
                if (loanPaymentAdviceToPartner[item.id]) {
                    item.LoanPaymentAdviceToPartner = loanPaymentAdviceToPartner[item.id];
                }
                if (item.Customer && pans[item.Customer.id]) {
                    item.Customer.Pan = pans[item.Customer.id];
                }
                if (item.Customer && digioEkycRequests[item.Customer.id]) {
                    item.Customer.DigioEkycRequest = digioEkycRequests[item.Customer.id];
                }
                if (item.Customer && customerEKycs[item.Customer.id]) {
                    item.Customer.CustomerEKyc = customerEKycs[item.Customer.id];
                }
            }
        } else {
            records.LoanPaymentAdviceToPartner = loanPaymentAdviceToPartner[records.id];
            if (records.Customer) {
                records.Customer.Pan = pans[records.Customer.id];
                records.Customer.DigioEkycRequest = digioEkycRequests[records.Customer.id];
                records.Customer.CustomerEKyc = customerEKycs[records.Customer.id];  
            }  
        }

        return records;
    }

    /**
     * Fetch information about a particular loan
     * @param req
     * @param res
     */
    static async getCustomerLoans(req: Request, res: Response) {

        // Fetch the loan application
        let queryMeta: any = { where: {} };

        // Apply the status filter.
        if (isDefined(req.query.status, true) && ['active', 'delinquent', 'closed', 'cancelled'].indexOf(req.query.status) !== -1) {
            queryMeta.where.status = req.query.status;
        }

        if (isDefined(req.query['customer'], true)) {
            queryMeta.where.consumer = req.query['customer'];
        } else {
            sendErrorResponse(res, ERROR_MESSAGES.CUSTOMER_NOT_FOUND, NOT_FOUND);
        }

        queryMeta.attributes = ['id', 'loanNumber'];

        queryMeta.include = [{
            model: db.LoanApplication,
            attributes: ['id', 'approverComment', 'oldLoanAmount', 'approverName', 'upgradedBy', 'upgraderComment', 'systemEmiAmountWaivedBy',
                'systemEmiWaiverComment', 'skipEmandate', 'loanTerm', 'oldApplicationStatus', 'applicationStatus', 'serviceAmount', 'oldLoanTerm',
                'upgradedBy', 'upgraderComment', 'systemEmiAmountWaivedBy', 'systemEmiWaiverComment', 'skipEmandate', 'refuseReason',
                'serviceUserSalutation', 'serviceUserFirstName', 'serviceUserLastName']
        }]

        let loan = await db.Loan.findAll(queryMeta)

        if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);

        return sendSuccessResponse(res, loan);
    }

    /**
    * Fetch information about a particular loan
    * @param req
    * @param res
    */
    static async getOne(req: Request, res: Response) {
        let condition: any = {};
        if(req.user.role == 'PARTNER' && !req.user.partnerId){
            return sendErrorResponse(res, "Branch selection required.", BAD_REQUEST);
        }

        // Apply customer filter if the requested user is a customer
        if (req.user.role && req.user.role === 'CUSTOMER') {
            condition = { consumer: req.user.id };
        }

        try {
            // Fetch the loan application
            let loan = await db.Loan.findOne({
                where: { id: req.params.id, ...condition },
                include: [{
                    model: db.Customer,
                    attributes: { exclude: ['password', 'salt', 'cibilLastChecked', 'creditReport'] }
                },{
                    model: db.PartnerPayments,
                }],
                attributes: {
                    include: [
                        ['createdAt', 'dateOfDisbursement'],
                        [db.sequelize.literal(parenthesis(`Loan.principalOutstanding`)), 'outstandingAmount'],
                        [db.sequelize.literal(parenthesis(`Loan.loanAmount - Loan.principalOutstanding`)), 'paymentsReceived']
                    ],
                },
            });

            let razorPayMandateDetails = await db.RazorPayMandateDetails.findAll({
                where: { loanId: req.params.id }
            });

            let closeLoanStates = await db.CloseLoanState.findAll({
                attributes: ["id", "user", "closureType", "requestorType", "remark", "isRejected", "actionDate"],
                where : { "loanId" : req.params.id },
                require : false,
                include: [{
                    model: db.User,
                    attributes: ['id', 'firstName', 'lastName']
                }]
            });

            if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);
            loan = loan.toJSON();

            loan.CloseLoanStates = closeLoanStates.filter( o => !o.isRejected );
            loan.CloseLoanStatesHistory = closeLoanStates;
            
            // Get Loan Application Detail
            let loanApplication: any = await db.LoanApplication.findOne({
                where: { id: loan.loanApplicationId },
                include: [{
                    model: db.Branch,
                    attributes: ['name'],
                    include: [{
                        model: db.Partner,
                        attributes: ['name'],
                        include: [{
                            model: db.Service,
                            attributes: ['name'],
                            include: [{
                                model: db.Sector,
                                attributes: ['name']
                            }]
                        }]
                    },
                    {
                        model: db.BranchLoanSetting,
                        required: true,
                    }]
                }, {
                    model: db.Organization,
                    attributes: ['name', 'id', 'razorPayKey', 'razorPaySecretKey'],
                    required: false
                }, {
                    model: db.ApiWebhookLogs,
                    required: false,
                    include: [{
                        model: db.ApiWebhooks,
                        attribures: ["id", "eventName", "apiName"]
                    }]
                }]
            });

            let razorPayEnachKey = process.env.RAZORPAY_KEY_ENACH;
            if (loanApplication.Organization && loanApplication.Organization.razorPayKey) {
                if (loanApplication.Organization.id != 1) {
                    razorPayEnachKey = decryptText(loanApplication.Organization.razorPayKey);
                }
            }
            loanApplication = loanApplication.toJSON();
            loanApplication.Organization.razorPayKey = razorPayEnachKey;

            let reviewHistory = await db.ReviewHistories.findAll({
                where: { loanApplicationId: loanApplication.id },
                include: [
                    adminiCreatedBy(),
                    adminiUpdatedBy()
                ]
            });
            loanApplication.ReviewHistories = reviewHistory;

            loan.LoanApplication = loanApplication;

            // Get Loan EMIs Detail
            let loanEmis = await db.LoanEmi.findAll({
                where: { loanId: loan.id }
            });

            loan.LoanEmis = loanEmis.map(o => {
                if (o.status == "Not Due" && new Date(o.dueDate) < new Date()) {
                    o.status = "Over Due";
                }
                return o;
            });

            let list = [];
            let pos = loan.loanAmount;
            if (loan.LoanEmis && loan.LoanEmis.length) {
                let amount = loan.loanAmount;
                let moratoriumTenure = loan.LoanApplication.moratoriumTenure || 0;
                let startDate: any = moment(new Date(loan.LoanEmis[0].dueDate)).add((moratoriumTenure + 1) * -1, "months");
                while (moratoriumTenure > 0) {
                    startDate = moment(new Date(startDate)).add(1, "months");
                    let interest = (amount * (loan.LoanApplication.interest / 100)) / 12;
                    amount += interest;
                    moratoriumTenure--;
                    list.push({ "dueDate": startDate, "emiAmount": 0, 'principal': 0, 'interest': interest, "pos": amount });
                }
                pos = amount;
                loan.LoanEmis.map(o => {
                    let i = o.toJSON();
                    if (i.paidAmount > 0) {
                        let paidAmount = i.principal > i.paidAmount ? i.paidAmount : i.principal;
                        pos -= paidAmount;
                    }
                    amount -= i.principal;
                    i.pos = amount;
                    list.push(i);
                });
            }
            loan.accruedEmiList = list;

            // Get Customer Payments Detail
            let customerPayments = await db.CustomerPayments.findAll({
                where: { loanId: loan.id, paymentType: EMI },
                include: [{
                    model: db.CustomerPaymentModeMaster,
                    attributes: ["id", "name"]
                }, {
                    model: db.PaymentEventInformations,
                    attributes: ["id", "status", "errorCode", "errorDescription", "createdAt"]
                }]
            });

            // Get Hypothecation detail
            loan.BankerLoan = await db.BankerLoan.findOne({
                where: { id: loan.hypothecation }
            });

            // Add custom properties to the sequelize result object.
            loan.paymentsMade = loanEmis.filter(o => o.status === 'Paid');
            loan.pendingPayments = loanEmis.filter(o => o.status !== 'Paid');

            let creditDebitEmis: any = [];

            customerPayments = customerPayments.map((o) => {
                let item = o.toJSON();
                let targetDate = item.paidAt;
                if (!item.paidAt) {
                    targetDate = item.createdAt;
                    item.paidAt = targetDate
                }
                item.targetId = moment(targetDate).format("YYYYMMDD") + 1;
                item.paidDate = targetDate;

                if (o.rpPaymentId != null || o.remark != null) {
                    item.emiSuccess = true;
                    creditDebitEmis.push(item);
                }
                if (o.PaymentEventInformation && o.PaymentEventInformation.status != "captured") {
                    let item2 = o.toJSON();
                    item2.targetId = moment(item2.createdAt).format("YYYYMMDD") + 2;
                    item2.emiAmount = item2.amount;
                    delete item2.amount;
                    item2.emiBounce = true;
                    creditDebitEmis.push(item2);
                }
                return item;
            });

            let today = moment(new Date()).format("YYYYMMDD");
            loanEmis.map(o => {
                if (moment(o.dueDate).format("YYYYMMDD") < today) { // o.status == 'Paid' || o.status == 'Partially Paid'){
                    let item = o.toJSON();
                    item.targetId = moment(item.dueDate).format("YYYYMMDD");
                    creditDebitEmis.push(item);
                    if (item.bounceCharge) {
                        let item2 = o.toJSON();
                        item2.emiAmount = item2.bounceCharge;
                        delete item2.amount;
                        item2.targetId = moment(item2.dueDate).format("YYYYMMDD");
                        item2.emiBounceCharge = true;
                        creditDebitEmis.push(item2);
                    }
                    if (item.penaltyCharge) {
                        let item2 = o.toJSON();
                        item2.targetId = moment(item2.dueDate).format("YYYYMMDD");
                        item2.emiAmount = item2.penaltyCharge;
                        delete item2.amount;
                        item2.emiBounceCharge = true;
                        creditDebitEmis.push(item2);
                    }
                }
            });

            creditDebitEmis.sort((a, b) => { return a.targetId < b.targetId ? -1 : 1 });
            customerPayments.sort((a, b) => { return a.targetId < b.targetId ? -1 : 1 });
            loan.CustomerPayments = customerPayments;
            let loanData = Object.assign({}, loan, { "CreditDebitEmis": creditDebitEmis, "RazorPayMandateDetails": razorPayMandateDetails });

            loanData.profileId = req.user.id;

            sendSuccessResponse(res, loanData);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Private common method to fetch all the loans from the database applying search, filter, pagination, sorting
     * @param req
     * @param paginate
     * @private
     */
    private static async _getExportList(req: Request, paginate: boolean = true, organization) {
        req.setTimeout(0);
        let filter: any = { where: {}, order: [['id', 'DESC']] };

        let filterByAccess: any = {};

        // Apply filters conditionally based on the user type
        if (req.user.role) {
            if (req.user.role === 'SYSTEM_ADMIN') {
                if (organization) {
                    filter.where.organizationId = organization;
                }
            }
            // If customer is logged in, set the consumer id to the logged in user's customer id
            if (req.user.role === 'CUSTOMER') {
                filter.where.consumer = req.user.id;
            } else if (['BRANCH_ADMIN', 'BRANCH_OWNER'].indexOf(req.
                user.role) !== -1) {
                filter.where['$LoanApplication.hold$'] = { [db.sequelize.Op.not]: true };

                // add branch and partner filter if the logged in user's role is BRANCH
                filterByAccess.partner = await Controller._getSubPartnerList(req.user.partnerId);
                filterByAccess.branch = await Controller._getSubBranchList(req.user.branchId);
            } else if (['SYSTEM_ADMIN', 'PROMOTER'].indexOf(req.user.
                role) !== -1) {

                // let the admin pass in any filter
                if (isDefined(req.query['partner'
                ], true)) filterByAccess.partner = req.query['partner'];
                if (isDefined(req.query['branch'], true)) filterByAccess.branch = req.query['branch'];
                if (isDefined(req.query['service'], true)) filterByAccess.service = req.query['service'];
                if (isDefined(req.query['sector'], true)) filterByAccess.sector = req.query['sector'];
                if (isDefined(req.query['customer'], true)) filter.where.consumer = req.query['customer'];

            } else if (req.user.role === 'PARTNER') {
                if(!req.user.partnerId){
                    return [];
                }
                filter.where['$LoanApplication.hold$'] = { [db.sequelize.Op.not]: true };

                // If the requested user is a partner, pre apply the partner = requested user id
                filterByAccess.partner = await Controller._getSubPartnerList(req.user.partnerId);

                // Apply the branch id filter if the user has provided it.
                if (isDefined(req.query['branch']
                    , true)) filterByAccess.branch = await Controller._getSubBranchList(req.query['branch']);

                if (isDefined(req.query['customer'], true)) filter.where.consumer = req.query['customer'];

            }
        } else {
            return [];
        }

        if (isDefined(req.query['branch'] , true)) filter.where['$LoanApplication.branchId$'] = await Controller._getSubBranchList(req.query['branch']);

        // Sort column. example ?sort=name,asc
        if (isDefined(req.query.sort, true)) {
            let orderBy = req.query.sort.split(',');
            let validSortFields = {
                id: ['id'],
                outstandingAmount: ['principalOutstanding'],
                disbursedDate: ['createdAt'],
                loanAmount: 'LoanApplication.loanAmount',
                tenure: 'LoanApplication.loanTerm',
                paymentsReceived: 'paymentsReceived',
            };

            if (orderBy.length === 2 && validSortFields.
                hasOwnProperty(orderBy[0])

                && ['ASC', 'DESC'].indexOf(orderBy[1].
                    toUpperCase()) !== -1) {

                if (['loanAmount', 'tenure', 'paymentsReceived'].indexOf(
                    orderBy[0]) !== -1) {
                    filter.order = db.sequelize.literal(`\`${validSortFields[orderBy[0]]}\` ${orderBy[1]}`);

                } else {
                    filter.order = [[...validSortFields[orderBy[
                        0]], orderBy[1]]];
                }
            }
        }

        // Apply the status filter.
        if (isDefined(req.query.status, true) && ["active", "delinquent", "closed", "cancelled"].indexOf(req.
            query.status) !== -1) {

            filter.where.status = req.query.status;
        }

        // For deferent tabs
        if (isDefined(req.query.
            loanStatus, true)) {

            if (req.query.loanStatus == "toVerify") {
                filter.where.isVerified = { [db.Sequelize.Op.is]: null };
                filter.where.status = "active";
                filter.where.loanStatus = "PROCESSED";
            }

            if (req.query.loanStatus == "toDisburse") {
                filter.where.isVerified = { [db.Sequelize.Op.not]: null };
                filter.where.status = "active";
                filter.where.loanStatus = "PROCESSED";
            }

            if (req.query.loanStatus == "running") {
                filter.where.status = {
                    [db.Sequelize.Op.or]: ["active", "delinquent"]
                }
                filter.where.loanStatus = "DISBURSED";
            }

            if (req.query.loanStatus == "closed") {
                filter.where.status = "closed";
            }

            if (req.query.loanStatus == "cancelledOrRejected") {
                filter.where[db.Sequelize.Op.
                    or] = [{
                        status: "cancelled"
                    }, {
                        "$LoanApplication.applicationStatus$": {

                            [db.Sequelize.Op.or]: [APPLICATION_STATE.REJECTED, APPLICATION_STATE.CANCELLED]
                        }
                    }];
            }
        }


        let customerfilter: any = { where: {} };
        let fields: any = {
            'email': '$Customer.email$',
            'mobile': '$Customer.mobile$',
            'fullName': '$Customer.fullName$'
        };

        // Apply the date filter
        for (let field in fields) {
            if (isDefined(req.query.q) && req.query.q !== '' && req.query.qf == field) {
                customerfilter.where[fields[field]] = parseInput(fields[field], req.query.q, "like");
            } else if (isDefined(req.query[field], true)) {
                customerfilter.where[fields[field]] = parseInput(fields[field], req.query[field]);
            }
        }
        let customerData = null;
        let customerPanData = null;
        let $consumerIDs = [];

        if (Object.keys(customerfilter.where).length) {
            customerData = await db.Customer.findAll({
                attributes: {
                    exclude: [
                        "password",
                        "salt",
                        "cibilLastChecked",
                        "updatedAt",
                        "creditReport"
                    ],
                    include: [
                        ['fullName', 'name'],
                        [db.sequelize.literal('CASE WHEN cibilScore IS NULL THEN 0 ELSE 1 END'), 'creditReport']
                    ]
                },
                where: customerfilter.where
            });
            customerData = Controller.converKeyData(customerData, "id");
            $consumerIDs = Object.keys(customerData);
            if (!$consumerIDs.length) {
                return [];
            }
            filter.where.consumer = { [db.Sequelize.Op.in]: $consumerIDs };
        }

        if (Object.keys(customerfilter.where).length && isDefined(req.query.qf) && req.query.qf == "fullName") {
            customerPanData = await db.Pan.findAll({
                attributes: ["id", "pan", "status", "fullName"],
                where: customerfilter.where
            });
            customerPanData = Controller.converKeyData(customerPanData, "id");
            $consumerIDs = Object.keys(customerPanData);
            if (!$consumerIDs.length) {
                return [];
            }
            filter.where.consumer = { [db.Sequelize.Op.in]: $consumerIDs };
        }

        fields = {
            'loanNumber': '$Loan.loanNumber$',
            'applicationNumber': '$LoanApplication.applicationNumber$',
        };

        if (isDefined(req.query.q) && req.query.q !== '' && !isDefined(req.query.qf)) {
            req.query.qf = 'loanNumber';
        }

        // Apply the date filter
        for (let field in fields) {
            if (isDefined(req.query.q) && req.query.q !== '' && req.query.qf == field) {
                filter.where[fields[field]] = parseInput(fields[field], req.query.q, "like");
            } else if (isDefined(req.query[field], true)) {
                filter.where[fields[field]] = parseInput(fields[field], req.query[field]);
            }
        }

        // Apply the date filter
        let datefields = {
            'loanBooking': '$Loan.createdAt$',
            'loanApplication': '$LoanApplication.createdAt$',
            'disburseDate': '$Loan.disbursedAt$',
            'cancelDate': '$Loan.closedAt$'
        };

        let dateFilter = '$Loan.createdAt$';
        if (isDefined(req.query.bydate, true)) {
            dateFilter = datefields[req.query.bydate];
        }
        if (isDefined(req.query.
            startDate, true) && !isDefined(req.query.endDate, true)) {

            filter.where[dateFilter] = { [db.sequelize.Op.gte]: req.query.startDate }
        }
        if (!isDefined(req.query.
            startDate, true) && isDefined(req.query.endDate, true)) {

            filter.where[dateFilter] = { [db.sequelize.Op.lte]: req.query.endDate }
        }
        if (isDefined(req.query.
            startDate, true) && isDefined(req.query.endDate, true)) {

            filter.where[dateFilter] = { [db.Sequelize.Op.between]: [req.query.startDate, req.query.endDate] }
        }

        // Apply the amount filter
        if (isDefined(req.query.startAmount, true) && !isDefined(req.query.endAmount, true)) {
            filter.where['$LoanApplication.loanAmount$'] = { [db.sequelize.Op.gt]: req.query.startAmount }
        }
        if (!isDefined(!req.query.startAmount, true) && isDefined(req.query.endAmount, true)) {
            filter.where['$LoanApplication.loanAmount$'] = { [db.sequelize.Op.lt]: req.query.endAmount }
        }
        if (isDefined(req.query.startAmount, true) && isDefined(req.query.endAmount, true)) {
            filter.where['$LoanApplication.loanAmount$'] = { [db.Sequelize.Op.between]: [req.query.startAmount, req.query.endAmount] }
        }

        let attributes = [];

        if (isDefined(req.query.
            defaultedEmiRangeStart, true) || isDefined(req.query.defaultedEmiRangeEnd, true)) {

            filter.where.status = {
                [db.Sequelize.Op.in]: ['active', 'delinquent']
            };
            attributes.push([db.sequelize.
                literal(`(select DATEDIFF(CURRENT_DATE(), LoanEmis.dueDate)
    
                from LoanEmis
                where LoanEmis.loanId = Loan.id AND (LoanEmis.status = 'Not Paid' || (LoanEmis.status = 'Partially Paid' AND current_date() >= LoanEmis.dueDate))
                order by LoanEmis.dueDate ASC
                LIMIT 1)`), 'diff']);
        }
        // Defaulted EMI Collection filter
        if (!isDefined(req.query.
            defaultedEmiRangeStart, true) && isDefined(req.query.defaultedEmiRangeEnd, true)) {

            filter.having = {
                "$diff$": {
                    [db.Sequelize.Op.lt]: req.query.defaultedEmiRangeEnd
                }
            };
        }
        if (isDefined(req.query.
            defaultedEmiRangeStart, true) && isDefined(req.query.defaultedEmiRangeEnd, true)) {

            filter.having = {
                [db.Sequelize.Op.and]: [{
                    "$diff$": {
                        [db.Sequelize.Op.gte]: req.query.
                            defaultedEmiRangeStart

                    },
                }, {
                    "$diff$": {
                        [db.Sequelize.Op.lt]: req.query.defaultedEmiRangeEnd
                    },
                }]

            };
        }
        if (isDefined(req.query.
            defaultedEmiRangeStart, true) && !isDefined(req.query.defaultedEmiRangeEnd, true)) {

            filter.having = {
                "$diff$": {
                    [db.Sequelize.Op.gte]: req.query.
                        defaultedEmiRangeStart
                }
            };
        }

        filter.attributes = {
            include: [
                [db.sequelize.literal(parenthesis(`Loan.principalOutstanding`)), 'outstandingAmount'],
                [db.sequelize.literal(parenthesis(`Loan.loanAmount - Loan.principalOutstanding`)), 'paymentsReceived'],

                ...attributes
            ]
        };

        filter.include = [
            {
                model: db.LoanApplication,
                required: true,
                attributes: {
                    exclude: ['accessToken']
                },
                include: [{
                    model: db.Organization,
                    attributes: ['name', 'id', 'razorPayKey', 'razorPaySecretKey'],
                    required: false
                },
                {
                    model: db.User,
                    attributes: ['id', 'firstName', 'lastName'],
                    required: false
                }]
                // }, {
                //     model: db.RazorPayMandateDetails
            }, {
                model: db.BankerLoan,
                attributes: ['id', 'banker'],
                required: false
            }];

        if (isDefined(filterByAccess["partner"], true)) {
            let queryFilter = {};
            if (typeof filterByAccess["partner"] == "string" || typeof filterByAccess["partner"] == "number") {
                queryFilter["partner"] = filterByAccess["partner"];
            } else {
                queryFilter["partner"] = { [db.sequelize.Op.in]: filterByAccess["partner"] };
            }

            let branchIds = await db.Branch.findAll({
                attributes: ['id', 'partner'],
                where: queryFilter
            });

            branchIds = Object.keys(Controller.converKeyData(branchIds, "id"));

            filter.where['$LoanApplication.branchId$'] = { [db.Sequelize.Op.in]: branchIds };
        }

        if (isDefined(filterByAccess["branch"], true)) {
            if (typeof filterByAccess["branch"] == "string" || typeof filterByAccess["branch"] == "number") {
                filter.where['$LoanApplication.branchId$'] = filterByAccess["branch"];
            } else {
                filter.where['$LoanApplication.branchId$'] = { [db.sequelize.Op.in]: filterByAccess["branch"] };
            }
        }

        let records = await db.Loan.findAll({ ...filter });

        let $loanIDs = Controller.getUniqueData(
            records, ["id"]);

        let resultData = [];
        if ($loanIDs.length > 0) {
            let loanApplicationIds = Controller.getUniqueData(records, ['loanApplicationId']);
            let customerPayments = await db.CustomerPayments.findAll({ 
                attributes: ["id", "loanApplicationId", "paymentType"],
                where: { loanApplicationId: { [db.Sequelize.Op.in]: loanApplicationIds } } 
            });
            customerPayments = Controller.converKeyData(customerPayments, "loanApplicationId", "list");

            let partnerPaymentsData = await db.PartnerPayments.findAll({ 
                attributes: ["id", "loanId", "initialPaymentAmount", "holdBackPaymentAmount"],
                where: { loanId: { [db.Sequelize.Op.in]: $loanIDs } } 
            });
            partnerPaymentsData = Controller.converKeyData(partnerPaymentsData, "loanId", "list");

            let loanEmiData = await db.LoanEmi.findAll({ 
                where: { loanId: { [db.Sequelize.Op.in]: $loanIDs } } 
            });
            loanEmiData = Controller.converKeyData(loanEmiData, "loanId", "list");

            let loanPaymentAdvicetoPartnerData = await db.LoanPaymentAdviceToPartner.findAll({ 
                attributes: ["id", "loanId", "fundTransferReferenceId"],
                where: { loanId: { [db.Sequelize.Op.in]: $loanIDs } } 
            });
            loanPaymentAdvicetoPartnerData = Controller.converKeyData(loanPaymentAdvicetoPartnerData, "loanId");

            let closeLoanStateData = await db.CloseLoanState.findAll({
                attributes: ["loanId", "user", "closureType"],
                where: { loanId: { [db.Sequelize.Op.in]: $loanIDs } },
                include: [{
                    model: db.User,
                    attributes: ['id', 'firstName', 'lastName']
                }]
            });
            closeLoanStateData = Controller.converKeyData(closeLoanStateData, "loanId", "list");

            if (!$consumerIDs.length) {
                $consumerIDs = Controller.getUniqueData(records, ["consumer"]);
                customerfilter.where.id = {
                    [db.Sequelize.Op.in]: $consumerIDs
                };

                customerData = await db.Customer.findAll({
                    attributes: {
                        exclude: [
                            "password",
                            "salt",
                            "cibilLastChecked",
                            "updatedAt",
                            "creditReport"
                        ],
                        include: [
                            ['fullName', 'name'],
                            [db.sequelize.literal('CASE WHEN cibilScore IS NULL THEN 0 ELSE 1 END'), 'creditReport']
                        ]
                    },
                    where: { id: { [db.Sequelize.Op.in]: $consumerIDs } }
                });
                customerData = Controller.converKeyData(customerData, "id");
            }

            let customerKycsData = await db.CustomerEKycs.findAll({ where: { customerId: { [db.Sequelize.Op.in]: $loanIDs } } });
            customerKycsData = Controller.converKeyData(customerKycsData, "customerId");

            let digioEkycRequestsData = await db.DigioEkycRequests.findAll({ where: { customerId: { [db.Sequelize.Op.in]: $loanIDs } } });
            digioEkycRequestsData = Controller.converKeyData(digioEkycRequestsData, "customerId");

            let customerPanData = await db.Pan.findAll({ where: { customerId: { [db.Sequelize.Op.in]: $consumerIDs } } });
            customerPanData = Controller.converKeyData(customerPanData, "customerId");

            let branchIds = Controller.getUniqueData(records, ["LoanApplication", "branchId"]);
            let branchData = await db.Branch.findAll({
                attributes: ['id', 'name', 'partner', 'ifsc', 'accountNumber', 'bank', 'branch', 'beneficiaryName', 'city'],
                where: Controller.getFilterByAccess({ id: { [db.Sequelize.Op.in]: branchIds } }, filterByAccess, ["branch"], { "partner": "partner" })
            });

            let mandateData = await db.RazorPayMandateDetails.findAll({ where: { loanId: { [db.Sequelize.Op.in]: $loanIDs } } });
            mandateData = Controller.converKeyData(mandateData, "loanId");

            let partnerIds = Controller.getUniqueData(branchData, ["partner"]);
            branchData = Controller.converKeyData(branchData, "id");

            let branchSettingData = await db.BranchLoanSetting.findAll({
                attributes: ['id', 'interest', 'branch'],
                where: { branch: { [db.Sequelize.Op.in]: branchIds } }
            });
            branchSettingData = Controller.converKeyData(branchSettingData, "branch");

            let partnerData = await db.Partner.findAll({
                attributes: ['id', 'name', 'service'],
                where: Controller.getFilterByAccess({ id: { [db.Sequelize.Op.in]: partnerIds } }, filterByAccess, ["partner"], { "service": "service" })
            });
            let serviceIds = Controller.getUniqueData(partnerData, ["service"]);
            partnerData = Controller.converKeyData(partnerData, "id");

            let partnerLoanSettingData = await db.PartnerLoanSetting.findAll({
                attributes: ['id', 'isGSTExemption'],
                where: Controller.getFilterByAccess({ partner: { [db.Sequelize.Op.in]: partnerIds } }, filterByAccess, ["partner"], { "service": "service" })
            });
            partnerLoanSettingData = Controller.converKeyData(partnerLoanSettingData, "partner");

            let serviceData = await db.Service.findAll({
                attributes: ['id', 'name', 'sector'],
                where: Controller.getFilterByAccess({ id: { [db.Sequelize.Op.in]: serviceIds } }, filterByAccess, ["service"], { "sector": "sector" })
            });
            let sectorIds = Controller.getUniqueData(serviceData, ["sector"]);
            serviceData = Controller.converKeyData(serviceData, "id");

            let sectorData = await db.Sector.findAll({
                attributes: ['id', 'name'],
                where: Controller.getFilterByAccess({ id: { [db.Sequelize.Op.in]: sectorIds } }, filterByAccess, ["sector"])

            });
            sectorData = Controller.converKeyData(sectorData, "id");


            for (let key in serviceData) {
                if (sectorData[serviceData[key].sector]) {
                    serviceData[key].Sector = sectorData[serviceData[key].sector];

                } else {
                    //delete serviceData[key];
                }
            }

            for (let key in partnerData) {
                if (partnerLoanSettingData[partnerData[key]]) {
                    partnerData[key].PartnerLoanSettingData = partnerLoanSettingData[partnerData[key]];
                }

                if (serviceData[partnerData[key].service]) {
                    partnerData[key].Service = serviceData[partnerData[key].service];
                } else {
                    //delete partnerData[key];
                }
            }

            for (let key in branchData) {
                if (partnerData[branchData[key].partner]) {

                    branchData[key].Partner = partnerData[branchData[key].partner];
                    branchData[key].BranchLoanSetting = branchSettingData[branchData[key].id];

                } else {
                    //delete branchData[key];
                }
            }

            for (let key in customerData) {
                customerData[key].CustomerEKycs = customerKycsData[customerData[key].id];
                customerData[key].DigioEkycRequests = digioEkycRequestsData[customerData[key].id];
                customerData[key].Pans = customerPanData[customerData[key].id];
            }

            //let rows = records.map(o => o.toJSON());
            for (let item of records) {
                let data = item.toJSON();
                if (customerData && customerData[data.consumer] && branchData[data.
                    LoanApplication.branchId]) {
                    data.customerPayments = customerPayments[data.loanApplicationId || null];
                    data.PartnerPayments = partnerPaymentsData[data.id] || null;
                    data.RazorPayMandateDetail = mandateData[data.loanId] || null;
                    data.Customer = customerData[data.consumer] || null;
                    data.LoanEmis = loanEmiData[data.id] || [];
                    data.CloseLoanState = closeLoanStateData[data.id] || null;
                    data.LoanPaymentAdvicetoPartner = loanPaymentAdvicetoPartnerData[data.id] || null;
                    data.LoanApplication.Branch = branchData[data.
                        LoanApplication.branchId] || null;

                    resultData.push(data);
                }
            }
        }

        // Send the count and rows
        return resultData;
    }

    private static getFilterByAccess(args, filterByAccess, data, additional = {}) {
        data.forEach(item => {
            if (isDefined(filterByAccess[item], true)) {
                args.id = filterByAccess[item];
            }
        });

        for (let key in additional) {
            if (isDefined(filterByAccess[key], true)) {
                args[additional[key]] = filterByAccess[key];
            }
        };

        return args;
    }

    private static getUniqueData(data: any, fields: any) {
        if (!data) return [];
        let filterData = [];

        for (let item of data) {
            let value = item;
            for (let field of fields) {
                value = value[field];
            }
            filterData.push(value);
        }

        return [... new Set(filterData)];
    }

    private static converKeyData(data: any, field: any, result = "") {
        let keyData = result != "list" ? {} : [];
        if (!data) return keyData;

        for (let item of data) {
            item = item.toJSON();
            if (result != "list")
                keyData[item[field]] = item;
            else {
                if (!keyData[item[field]]) {
                    keyData[item[field]] = [];
                }
                keyData[item[field]].push(item);
            }
        }
        return keyData;
    }

    static async markAsVerified(req: Request, res: Response) {
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'status', 'isVerified', 'loanStatus', 'isVerifiedAt', 'isVerifiedBy', 'loanApplicationId'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'isDisabled'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'isDisabled']
                        }]
                    }]
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            // check the status and notify the user if the loan is already closed
            if (loan.status.toUpperCase() === 'CLOSED' || loan.status.toUpperCase() === 'CANCELLED') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_CLOSED, 400);
            }

            if (loan.isVerified) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_VERIFIED, 400);
            }

            if (loan.loanStatus == 'DOCSPENDING') {
                loan.loanStatus = 'PROCESSED';
                loan.save();
            }

            // Prevent initiating the loan if the branch or partner is disabled.
            if (loan.LoanApplication.Branch.isDisabled || loan.LoanApplication.Branch.Partner.isDisabled) {
                return sendErrorResponse(res, ERROR_MESSAGES.ACCOUNT_DISABLED, BAD_REQUEST);
            }

            let fullName = req.user.firstName + " " + req.user.lastName;
            loan.isVerifiedAt = new Date();
            loan.isVerifiedBy = fullName;
            loan.isVerified = req.body.comment || "no comments";

            await loan.save();

            let loanApplication = await db.LoanApplication.findOne({
                attribute: ['id', 'branchId'],
                where: { id: loan.loanApplicationId }
            });

            emitWebHookEvent(req, APIWEBHOOKS.APPLICATION_STATUS, await getApiUserId(loanApplication), loanApplication);

            sendSuccessResponse(res, {}, "The loan has marked as verified");

        } catch (e) {
            internalServerError(res, e)
        }
    }

    static async docsPending(req: Request, res: Response) {
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'status', 'docsPending'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'isDisabled'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'isDisabled']
                        }]
                    }]
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            // check the status and notify the user if the loan is already closed
            if (loan.status.toUpperCase() === 'CLOSED' || loan.status.toUpperCase() === 'CANCELLED') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_CLOSED, 400);
            }

            if (loan.loanStatus == 'DOCSPENDING') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_MARKED, 400);
            }

            // Prevent initiating the loan if the branch or partner is disabled.
            if (loan.LoanApplication.Branch.isDisabled || loan.LoanApplication.Branch.Partner.isDisabled) {
                return sendErrorResponse(res, ERROR_MESSAGES.ACCOUNT_DISABLED, BAD_REQUEST);
            }

            loan.loanStatus = 'DOCSPENDING';
            loan.docsPending = req.body.comment;
            loan.docsPendingBy = req.body.docsPendingBy;
            loan.docsPendingAt = new Date();

            await loan.save();
            sendSuccessResponse(res, {}, "The loan has marked as Docs pending");

        } catch (e) {
            internalServerError(res, e)
        }
    }


    static async rebook(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'status', 'consumer', 'subStatus', 'closedAt', 'pendingRecovery', 'principalOutstanding'],
                where: { id: req.params.id },
                include: [{
                    model: db.Customer,
                    attributes: ['id', 'oldCategory', 'category', 'principalOutstanding']
                }, {
                    model: db.LoanEmi
                }, {
                    model: db.LoanApplication,
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'isDisabled', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'isDisabled', 'organizationId', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'name', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            // check the status and notify the user if the loan is already closed
            if (loan.status.toUpperCase() === 'CLOSED') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_CLOSED, 400);
            }

            // Prevent initiating the loan if the branch or partner is disabled.
            if (loan.LoanApplication.Branch.isDisabled || loan.LoanApplication.Branch.Partner.isDisabled) {
                return sendErrorResponse(res, ERROR_MESSAGES.ACCOUNT_DISABLED, BAD_REQUEST);
            }

            await oTransactionHandler.getTransaction();;


            loan.subStatus = null;
            loan.status = "closed";
            loan.closedAt = new Date();

            const calculatePrincipal = (emi: number, delta: number, interest: number) => {
                let amount = emi - delta - interest;
                return amount < 0 ? 0 : amount
            }

            let principalPaid = loan.LoanEmis.reduce((paid: number, emi: any) => {
                if (emi.status == "Paid") {
                    return paid;
                }

                const partiallyPaid = emi.status === "Partially Paid";
                let emiAmount = partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount;

                emi.deltaEmiAmount = 0;

                const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                paid += currentPrincipal - previousPrincipal;
                return paid;
            }, 0);


            await Promise.all([
                db.CustomerPayments.create({
                    customer: loan.consumer,
                    amount: loan.pendingRecovery,
                    paymentType: CUSTOMER_PAYMENT_EMI,
                    paymentMode: PRE_CLOSURE,
                    paidAt: new Date(),
                    loanApplicationId: loan.LoanApplication.id,
                    loanId: loan.id,
                    ...logCreatedBy(req)
                }, { transaction: oTransactionHandler.transaction }),
                db.LoanEmi.update({ status: 'Paid', deltaEmiAmount: 0 }, {
                    where: {
                        loanId: loan.id,
                    },
                    transaction: oTransactionHandler.transaction
                }),
            ]);

            loan.pendingRecovery = 0;

            if (loan.principalOutstanding - principalPaid <= 20) {
                principalPaid += loan.principalOutstanding - principalPaid;
            }

            await Promise.all([
                loan,
                loan.Customer,
                loan.LoanApplication.Branch,
                loan.LoanApplication.Branch.Partner,
                loan.LoanApplication.Branch.Partner.Service,
                loan.LoanApplication.Branch.Partner.Service.Sector,
            ].map((model: any) => {
                model.principalOutstanding -= principalPaid;
                return model.save({ transaction: oTransactionHandler.transaction });
            }));

            // Create a new loan application and loan
            const copyLoanApplication = await db.LoanApplication.create({
                personTakingSameAsPersonUsing: loan.LoanApplication.personTakingSameAsPersonUsing,
                organizationId: loan.LoanApplication.Branch.Partner.organizationId,
                isExistingUser: loan.LoanApplication.isExistingUser,
                offlineKYC: loan.LoanApplication.offlineKYC,
                filledBy: loan.LoanApplication.filledBy,
                branchId: loan.LoanApplication.branchId,
                user: loan.LoanApplication.user,
                consumer: loan.LoanApplication.consumer,
                periodOfService: loan.LoanApplication.periodOfService,
                waiverProcessingFee: loan.LoanApplication.waiverProcessingFee,
                applyInsurance: loan.LoanApplication.applyInsurance,
                addInsuranceAmountToEMI: loan.LoanApplication.addInsuranceAmountToEMI,
                insuranceAmount: loan.LoanApplication.insuranceAmount,
                commitmentFee: loan.LoanApplication.commitmentFee,
                processingFee: loan.LoanApplication.processingFee,
                processingFeeToPartner: loan.LoanApplication.processingFeePartner,
                signedDocumentPathS3: loan.LoanApplication.signedDocumentPathS3,
                isDocumentSigned: loan.LoanApplication.isDocumentSigned,
                isTermsAccepted: loan.LoanApplication.isTermsAccepted,
                applicationStatus: APPLICATION_STATE.APPLICATION_SUBMITTED,
                invoiceID: loan.LoanApplication.invoiceID,
                coverNotedID: loan.LoanApplication.coverNotedID,
                pathToCoverNoteS3: loan.LoanApplication.pathToCoverNoteS3,
                addressProofS3: loan.LoanApplication.addressProofS3,
                pathToInvoiceS3: loan.LoanApplication.pathToInvoiceS3,
                isTest: loan.LoanApplication.isTest,
                serviceUserSalutation: loan.LoanApplication.serviceUserSalutation,
                serviceUserFirstName: loan.LoanApplication.serviceUserFirstName,
                serviceUserLastName: loan.LoanApplication.serviceUserLastName,
                serviceUserRelationship: loan.LoanApplication.serviceUserRelationship,
                minSubvention: loan.LoanApplication.minSubvention,
                maxTicketSize: loan.LoanApplication.maxTicketSize,
                minTicketSize: loan.LoanApplication.minTicketSize,
                maxTenure: loan.LoanApplication.maxTenure,
                maxOutStanding: loan.LoanApplication.maxOutStanding,
                minHoldBack: loan.LoanApplication.minHoldBack,
                holdBackPaymentTerm: loan.LoanApplication.holdBackPaymentTerm,
                interest: loan.LoanApplication.interest,
                subvention: loan.LoanApplication.subvention,
                kycCompleted: loan.LoanApplication.kycCompleted,
                forceDocumentUpload: loan.LoanApplication.forceDocumentUpload,
                idProof: loan.LoanApplication.idProof,
                idProofPathS3: loan.LoanApplication.idProofPathS3,
                idProofFrontPathS3: loan.LoanApplication.idProofFrontPathS3,
                idProofBackPathS3: loan.LoanApplication.idProofBackPathS3,
                addressProof: loan.LoanApplication.addressProof,
                addressProofFrontPathS3: loan.LoanApplication.addressProofFrontPathS3,
                addressProofBackPathS3: loan.LoanApplication.addressProofBackPathS3,
                photoPathS3: loan.LoanApplication.photoPathS3,
                photoUploaded: loan.LoanApplication.photoUploaded,
                ...logCreatedBy(req),
                loanAmount: req.body.amount,
                serviceAmount: req.body.amount,
                partnerServiceAmount: req.body.amount,
                loanTerm: req.body.term,
                originalLoanTerm: req.body.term,
                eligibleAmount: loan.LoanApplication.eligibleAmount,
                locked: loan.LoanApplication.locked,
                completedPartnerFlow: loan.LoanApplication.completedPartnerFlow,
                manualApproval: loan.LoanApplication.manualApproval,
                insuranceProvider: loan.LoanApplication.insuranceProvider,
                waiveMCPCheck: loan.LoanApplication.waiveMCPCheck,
                overridden: loan.LoanApplication.overridden,
                structuredEmis: loan.LoanApplication.structuredEmis
            }, { transaction: oTransactionHandler.transaction });

            let loanThresholdValue = await db.GlobalSetting.findOne({ where: { isActive: true } });

            const installment = calculateRevisedEmi({
                insuranceAmount: copyLoanApplication.applyInsurance ? copyLoanApplication.insuranceAmount : 0,
                interest: copyLoanApplication.interest,
                loanAmount: copyLoanApplication.serviceAmount,
                loanTerm: copyLoanApplication.loanTerm,
                loanThresholdValue,
                partnerAdvanceTenure: 0,
                systemAdvanceTenure: 0,
                moratoriumTenure: copyLoanApplication.moratoriumTenure,
                emiNumbersToBeSkipped: copyLoanApplication.emiNumbersToBeSkipped,
                structuredEmis: copyLoanApplication.structuredEmis,
                additionalSettings: {}
            });

            copyLoanApplication.applicationNumber = generateLoanApplicationNumber(
                loan.LoanApplication.Branch.id,
                loan.LoanApplication.Branch.Partner.Service.name,
                copyLoanApplication.id
            );

            let customerLink = [process.env.CUSTOMER_CLIENT_PATH, CUSTOMER_LOAN_APPLICATION_PATH, copyLoanApplication.accessToken].join('');
            let customerTCLink = [process.env.CUSTOMER_CLIENT_PATH, CUSTOMER_TERMS_CONDITIONS_PATH, copyLoanApplication.accessToken].join('');

            const bitly = await generateBitlyLink(customerLink);

            const bitlyTC = await generateBitlyLink(customerTCLink);

            copyLoanApplication.emiAmount = installment.periodicPayment;
            copyLoanApplication.accessToken = generateHash((copyLoanApplication.id + Date.now()).toString());
            copyLoanApplication.accessTokenExpiresAt = moment().add(parseInt(process.env.LOAN_APPLICATION_EXPIRY_IN_DAYS), 'days').format('YYYY-MM-DD HH:mm:ss');
            copyLoanApplication.bitlyLink = bitly.url;
            copyLoanApplication.termsConditionsBitlyLink = bitlyTC.url;
            copyLoanApplication.approvedAt = new Date();

            if (copyLoanApplication.emiAmount <= loan.LoanApplication.emiAmount) {
                copyLoanApplication.eNachID = loan.LoanApplication.eNachID;
                copyLoanApplication.eNachStatus = loan.LoanApplication.eNachStatus;
                copyLoanApplication.emandate = loan.LoanApplication.emandate;
                copyLoanApplication.emandateDate = loan.LoanApplication.emandateDate;
            }

            await copyLoanApplication.save({ transaction: oTransactionHandler.transaction });

            // Convert loan application to loan
            let copyLoan = await db.Loan.create({
                consumer: loan.Customer.id,
                loanApplicationId: copyLoanApplication.id,
                loanAmount: copyLoanApplication.loanAmount,
                principalOutstanding: copyLoanApplication.loanAmount,
                loanStatus: 'PROCESSING',
                loanTerm: copyLoanApplication.loanTerm,
                eNachToken: copyLoanApplication.eNachID,
                emandateDate: copyLoanApplication.emandateDate || null,
                category: loan.Customer.oldCategory,
                enhancedCategory: loan.Customer.category,
                organizationId: copyLoanApplication.organizationId || null,
                isTest: false,
                ...logCreatedBy(req)
            }, { transaction: oTransactionHandler.transaction });

            // Generate the loan number
            copyLoan.loanNumber = generateLoanNumber(
                loan.LoanApplication.Branch.id,
                loan.LoanApplication.Branch.Partner.Service.name,
                copyLoan.id
            );

            await copyLoan.save({ transaction: oTransactionHandler.transaction });
            await ApplicationController.convertToLoan(copyLoan.id, oTransactionHandler.transaction, true);

            await oTransactionHandler.commit();

            return sendSuccessResponse(res, {}, "The loan has been re-booked");
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e)
        }
    }

    static async subvPaid(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'status'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'isDisabled'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'isDisabled']
                        }]
                    }]
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            // check the status and notify the user if the loan is already closed
            if (loan.status.toUpperCase() === 'CLOSED') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_CLOSED, 400);
            }

            // Prevent initiating the loan if the branch or partner is disabled.
            if (loan.LoanApplication.Branch.isDisabled || loan.LoanApplication.Branch.Partner.isDisabled) {
                return sendErrorResponse(res, ERROR_MESSAGES.ACCOUNT_DISABLED, BAD_REQUEST);
            }

            let dateFormat = { date: req.body.date.year + '-' + req.body.date.month + '-' + req.body.date.day };

            loan.subAmountUtr = req.body.utr;
            loan.subAmountPaidDate = dateFormat.date;
            loan.subAmountRemark = req.body.remark;

            loan.save();
            return sendSuccessResponse(res, {}, "The loan marked has received Subvention amount from partner");
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e)
        }
    }

    static async _subvPaid(req: Request, res: Response, subventionPayments: any) {
        let oTransactionHandler = new TransactionHandler();
        try {
            // Find the loan
            let loans = await db.Loan.findAll({
                where: { id: { [db.Sequelize.Op.in]: subventionPayments.map(subventionPayment => subventionPayment.loanId) } },
                include: [{
                    model: db.LoanApplication,
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'isDisabled'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'isDisabled']
                        }]
                    }]
                }]
            });

            for (let loan of loans) {
                const loanData = subventionPayments.find(loanDetails => loanDetails.loanId == loan.id);
                loan.subAmountUtr = loanData.utrNumber,
                    loan.subAmountPaidDate = moment(loanData.paidAt, 'DD-MM-YYYY').toDate(),
                    loan.subAmountRemark = loanData.remark || null,
                    await loan.save();
            }
            return true;
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e)
        }
    }

    /**
     * Discontinue a service.
     * This basically a service which inform the admin by an email that the
     * service at the branch end has discontinued.
     * @param req
     * @param res
     */
    static async discontinue(req: Request, res: Response) {
        try {
            // Get the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'status', 'loanNumber', 'paused'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        include: [db.Partner]
                    }]
                }, {
                    model: db.Customer,
                    attributes: ['id', 'fullName']
                }]
            });

            // Prevent discontinuing an active loan
            if (loan.status == 'active') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_PREVENT_DISCONTINUE, NOT_FOUND);
            }

            // set the paused status to true
            loan.paused = true;

            await loan.save();

            // Send an email to the admin about the discontinue of service.
            let emailList = [{
                to_email: [process.env.SYSTEM_ADMIN_EMAIL],
                subject: template(REQUEST_TO_DISCONTINUE)({ appName: APP_NAME }),
                body: templateRenderer(serviceDiscontinueEmailTemplate, {
                    partner: loan.LoanApplication.Branch.Partner.name,
                    branch: loan.LoanApplication.Branch.name,
                    customer: loan.Customer.fullName,
                    loanNumber: loan.loanNumber,
                    APP_NAME: APP_NAME
                })
            }];
            await sendEmail(emailList);

            sendSuccessResponse(res, loan, LOANS_SERVICE_DISCONTINUE_REQUESTED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Resume a discontinued service from the branch end
     * @param req
     * @param res
     */
    static async resume(req: Request, res: Response) {
        try {
            // Find the loan a by the loan id
            let loan = await db.Loan.findOne({
                attributes: ['id', 'status', 'loanNumber', 'paused'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        include: [db.Partner]
                    }]
                }, {
                    model: db.Customer,
                    attributes: ['id', 'fullName']
                }]
            });

            // Prevent resuming the service if the loan is delinquent
            if (loan.status == 'delinquent') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_PREVENT_RESUME, NOT_FOUND);
            }

            // Change the paused status to false
            loan.paused = false;

            await loan.save();

            // Prepare the email body
            let emailList = [{
                to_email: [process.env.SYSTEM_ADMIN_EMAIL],
                subject: template(REQUEST_TO_RESUME)({ appName: APP_NAME }),
                body: templateRenderer(serviceResumeEmailEmailTemplate, {
                    partner: loan.LoanApplication.Branch.Partner.name,
                    branch: loan.LoanApplication.Branch.name,
                    customer: loan.Customer.fullName,
                    loanNumber: loan.loanNumber,
                    APP_NAME: APP_NAME
                })
            }];

            // Send the email to admin informing that the service has resumed by the branch
            await sendEmail(emailList);

            sendSuccessResponse(res, loan, LOANS_SERVICE_RESUME_REQUESTED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Retrieves the current EMI amount for a loan
     * @param req
     * @param res
     */
    static async getEmiAmount(req: Request, res: Response) {
        try {
            // Get the loan id
            req.params.id = req.params.id || req['loanId'];

            // Find the loan by the provided loan id
            let loan = await db.Loan.findOne({
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    include: [{
                        model: db.Branch,
                        attributes: ['name']
                    }]
                }, {
                    model: db.LoanEmi,
                    required: false,
                }]
            });

            if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);

            // Call a helper method to fetch the loan summary
            let result = await getSummary2(loan);

            // send it to the client.
            sendSuccessResponse(res, result);
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    static async makeEMIPayment(req: Request, res: Response) {
        req.params.id = req.params.id || req['loanId'];
        let oTransactionHandler = new TransactionHandler();
        try {
            // Fetch the information about the loan
            let loan = await db.Loan.findOne({
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }, {
                    model: db.LoanEmi,
                    required: false,
                }, {
                    model: db.Organization,
                    attributes: ['name', 'id', 'razorPayKey', 'razorPaySecretKey']
                }, {
                    model: db.Customer,
                    attributes: ['id', 'mobile', 'principalOutstanding'],
                    required: false,
                }]
            });

            if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);

            let paidAmount = parseInt(req.body.paymentAmount), changedEmis = [];

            let razorPayEnachKey = process.env.RAZORPAY_KEY_ENACH;
            let razorPayEnachSecretKey = process.env.RAZORPAY_SECRET_ENACH;
            if ((loan.Organization && loan.Organization.razorPayKey) && (loan.Organization && loan.Organization.razorPaySecretKey)) {
                if (loan.Organization.id != 1) {
                    razorPayEnachKey = decryptText(loan.Organization.razorPayKey);
                    razorPayEnachSecretKey = decryptText(loan.Organization.razorPaySecretKey);
                }
            }

            let razorpayClient = new RazorpayClient(razorPayEnachKey, razorPayEnachSecretKey);

            await razorpayClient.capturePayment(req.body.paymentId, Math.round(paidAmount * 100));

            const calculatePrincipal = (emi: number, delta: number, interest: number) => {
                let amount = emi - delta - interest;
                return amount < 0 ? 0 : amount;
            }

            let principalPaid = 0, adjustedInstallmentStart = null, adjustedInstallmentEnd = 0,
                penaltyEmis = [], bounceEmis = [];

            let dueEmis = loan.LoanEmis.filter(emi => emi.status != "Not Due"),
                notDueEmis = loan.LoanEmis.filter(emi => emi.status == "Not Due");

            await oTransactionHandler.getTransaction();

            // Step 1: Process only EMI for all the due(includes Not Paid, Partially Paid, Paid) EMIs
            for (const [index, emi] of dueEmis.entries()) {
                const { penalty, bounce } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                // Push the EMIs to corresponding buckets
                penalty > 0 && penaltyEmis.push(emi);
                bounce > 0 && bounceEmis.push(emi);
                // Make sure customer has paid EMI, Penalty and Bounce components of the EMI explicitly
                if (emi.status === "Paid") {
                    continue;
                }

                if (paidAmount <= 0) {
                    // break out the loop if the paid become 0.
                    break;
                }

                const partiallyPaid = emi.status === "Partially Paid";

                let emiAmount = partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount;

                // To check, It has recorded any deduction for this EMI
                if (paidAmount >= emiAmount) {
                    emi.status = "Paid";
                } else {
                    emi.status = "Partially Paid";
                }

                let emiAmountPaid = emi.paidAmount;

                if (paidAmount > 0 && emiAmount > 0) {
                    if (paidAmount >= emiAmount) {
                        emi.deltaEmiAmount = 0;
                        paidAmount -= emiAmount;
                        emiAmountPaid += emiAmount;
                    } else {
                        emi.deltaEmiAmount = (partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount) - paidAmount;
                        emiAmountPaid += paidAmount;
                        paidAmount = 0;
                    }
                    const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                    const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                    principalPaid += currentPrincipal - previousPrincipal;
                }

                emi.paidAmount = emiAmountPaid;

                const emiExist = changedEmis.find(changedEmi => changedEmi.id == emi.id);
                emiExist || changedEmis.push(emi);
            }

            // Step 2: Process only Penalty for all the due(includes Not Paid, Partially Paid, Paid) EMIs
            for (const [index, emi] of penaltyEmis.entries()) {
                if (paidAmount <= 0) {
                    // break out the loop if the paid become 0.
                    break;
                }
                const { penalty } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                if (penalty > 0) {
                    if (paidAmount >= penalty) {
                        emi.penaltyDelta = 0;
                        emi.penaltyAmountPaid += penalty;
                        paidAmount -= penalty;
                        emi.paidAmount += penalty;
                    } else {
                        emi.penaltyAmountPaid += paidAmount;
                        emi.penaltyDelta = penalty - paidAmount;
                        emi.paidAmount += paidAmount;
                        paidAmount = 0;
                    }
                    const emiExist = changedEmis.find(changedEmi => changedEmi.id == emi.id);
                    emiExist || changedEmis.push(emi);
                }
            }

            // Step 3: Process only Bounce for all the due(includes Not Paid, Partially Paid, Paid) EMIs
            for (const [index, emi] of bounceEmis.entries()) {
                if (paidAmount <= 0) {
                    // break out the loop if the paid become 0.
                    break;
                }
                const { bounce } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                if (paidAmount > 0 && bounce > 0) {
                    if (paidAmount >= bounce) {
                        emi.bounceChargeDelta = 0;
                        emi.bounceChargeAmountPaid += bounce;
                        paidAmount -= bounce;
                        emi.paidAmount += bounce;
                    } else {
                        emi.bounceChargeAmountPaid += paidAmount;
                        emi.bounceChargeDelta = bounce - paidAmount;
                        emi.paidAmount += paidAmount;
                        paidAmount = 0;
                    }
                    const emiExist = changedEmis.find(changedEmi => changedEmi.id == emi.id);
                    emiExist || changedEmis.push(emi);
                }
            }

            // Step 4: Process only EMI for all the not due EMIs
            for (const [index, emi] of notDueEmis.entries()) {
                if (paidAmount <= 0) {
                    // break out the loop if the paid become 0.
                    break;
                }
                let emiAmount = emi.emiAmount;
                // To check, It has recorded any deduction for this EMI
                if (paidAmount >= emiAmount) {
                    emi.status = "Paid";
                } else {
                    emi.status = "Partially Paid";
                }
                let emiAmountPaid = emi.paidAmount;
                if (paidAmount >= emiAmount) {
                    emi.deltaEmiAmount = 0;
                    paidAmount -= emiAmount;
                    emiAmountPaid += emiAmount;
                } else {
                    emi.deltaEmiAmount = emi.emiAmount - paidAmount;
                    emiAmountPaid += paidAmount;
                    paidAmount = 0;
                }
                const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                principalPaid += currentPrincipal - previousPrincipal;
                emi.paidAmount = emiAmountPaid;
                changedEmis.push(emi);
            }

            adjustedInstallmentStart = changedEmis[0].emiNumber;
            adjustedInstallmentEnd = changedEmis[changedEmis.length - 1].emiNumber;

            const changedEmisPromise = changedEmis.map(changedEmi => changedEmi.save({ transaction: oTransactionHandler.transaction }));

            let isAllEmisPaid = true, isOverallPenaltyAndBouncePaid = true;
            for (const [emi] of loan.LoanEmis.entries()) {
                if (emi.status != 'Paid') {
                    isAllEmisPaid = false;
                    break;
                }
                const { penalty, bounce } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                if (penalty > 0 || bounce > 0) {
                    isOverallPenaltyAndBouncePaid = false;
                    break;
                }
            }

            if (isAllEmisPaid && isOverallPenaltyAndBouncePaid) {
                loan.subStatus = null;
                loan.status = "closed";
                loan.closedAt = new Date();
                if (loan.principalOutstanding - principalPaid <= 20) {
                    principalPaid += loan.principalOutstanding - principalPaid;
                }
            }

            await Promise.all(changedEmisPromise);

            // Update the database with the transaction information
            let customerPayment = await db.CustomerPayments.create({
                customer: loan.consumer,
                amount: req.body.paymentAmount,
                paymentType: EMI,
                paymentMode: GATEWAY_MODE,
                paidAt: req.body.paidAt,
                rpPaymentId: req.body.paymentId,
                loanApplicationId: loan.LoanApplication.id,
                loanId: loan.id,
                ...logCreatedBy(req)
            }, { transaction: oTransactionHandler.transaction });

            // Change the loan's last payment made date to today.
            loan.lastPaymentMade = new Date();
            loan.pendingRecovery -= paidAmount;

            await Promise.all([
                loan,
                loan.Customer,
                loan.LoanApplication.Branch,
                loan.LoanApplication.Branch.Partner,
                loan.LoanApplication.Branch.Partner.Service,
                loan.LoanApplication.Branch.Partner.Service.Sector,
            ].map((model: any) => {
                model.principalOutstanding -= principalPaid;
                return model.save({ transaction: oTransactionHandler.transaction });
            }));

            // Send the customer id by sms.
            let messageBody = await db.Template.findOne({ where: { name: 'SEND_SMS_FOR_EMI_PAYMENT_DONE' } });
            let smsMessage = template(messageBody.content)({
                amount: customerPayment.amount,
                emiList: formSentence(adjustedInstallmentStart, adjustedInstallmentEnd)
            });

            await Promise.all([
                sendSMS(loan.Customer.mobile, smsMessage),
            ]);
            await oTransactionHandler.commit();
            sendSuccessResponse(res, {}, 'Payment has been done');
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }
    }

    /**
     * Waive off charges against an EMI.
     * This method can be used waive off bounce charges and late interest fee.
     * @param req
     * @param res
     */
    static async waiveCharges(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        await oTransactionHandler.getTransaction();

        try {
            // Fetch the loan with all EMIs
            let loan = await db.Loan.findOne({
                attributes: ['id', 'totalPenaltyCharges', 'totalBounceCharges'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanEmi
                }]
            });

            // Find the requested EMI from the list
            let emi = loan.LoanEmis.find(installment => installment.id === req.params.emi);

            // If the provided value is less than current penalty, set it as waived off 
            if (req.body.penaltyCharge <= emi.penaltyAmount) {
                emi.penaltyWaived = true;
            }

            // If the provided value is higher than current penalty, set it as waived off
            if (req.body.bounceCharge <= emi.bounceCharges) {
                emi.bounceWaived = true;
            }

            // Update the overridden charges
            emi.penaltyAmountOverridden = req.body.penaltyCharge;
            emi.bounceChargesOverridden = req.body.bounceCharge;

            // Calculate the total penalty and bounce charges
            let { penalty, charges } = loan.LoanEmis.reduce((acc, emi) => {
                if (emi.penaltyWaived) {
                    acc.penalty += emi.penaltyAmountOverridden;
                } else {
                    acc.penalty += emi.penaltyCharge;
                }
                if (emi.bounceWaived) {
                    acc.bounceCharges += emi.bounceChargesOverridden;
                } else {
                    acc.bounceCharges += emi.bounceCharge;
                }
                return acc;
            }, { penalty: 0, bounceCharges: 0 });

            // Update the loan penalty charges and bounce changes
            loan.totalPenaltyCharges = penalty;
            loan.totalBounceCharges = charges;

            let originalPenalty = (emi.penaltyAmount ? emi.penaltyAmount : 0);
            let originalBounceCharges = (emi.bounceCharges ? emi.bounceCharges : 0);

            // Calculate the new total EMI amount
            emi.totalAmount = Math.round(emi.emiAmount +
                (emi.penaltyWaived ? emi.penaltyAmountOverridden : originalPenalty) +
                (emi.bounceWaived ? emi.bounceChargesOverridden : originalBounceCharges));

            // calculate the new delta amount
            // emi.deltaAmount = emi.totalAmount - emi.paidAmount;

            await Promise.all([
                emi.save({ transaction: oTransactionHandler.transaction }),
                loan.save({ transaction: oTransactionHandler.transaction }),
            ]);

            await oTransactionHandler.commit();
            sendSuccessResponse(res, await getEmiSummary(loan), LOANS_EMI_PENALTY_WAIVED_OFF);
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }
    }

    static async waiveCharges2(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        await oTransactionHandler.getTransaction();

        const isNull = (value: any) => value === null;
        try {
            // Fetch the loan with all EMIs
            let loan = await db.Loan.findOne({
                attributes: ['id', 'totalPenaltyCharges', 'totalBounceCharges', 'pendingRecovery'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanEmi
                }]
            });

            // Find the requested EMI from the list
            let emi = loan.LoanEmis.find((installment: any) => installment.id === req.params.emi);

            let PromiseList = [];
            if ((isNull(emi.penaltyDelta) && req.body.penaltyCharge <= emi.penaltyAmount)
                || (!isNull(emi.penaltyDelta) && req.body.penaltyCharge <= emi.penaltyDelta)) {
                let amount = 0;
                if (emi.penaltyDelta) {
                    amount = emi.penaltyDelta - req.body.penaltyCharge
                } else {
                    amount = emi.penaltyAmount - req.body.penaltyCharge
                }


                if (amount > 0) {
                    emi.penaltyWaived = true;
                    emi.penaltyAmountOverridden = req.body.penaltyCharge;
                    emi.penaltyDelta = req.body.penaltyCharge;
                    emi = logUpdatedBy(req, emi);
                    PromiseList.push(db.WaiverRemark.create({
                        emiId: emi.id,
                        waiverType: 'PENAL',
                        amount: amount,
                        remark: req.body.waiverRemark,
                        ...logCreatedBy(req)
                    }, oTransactionHandler.transaction));
                }
            }

            if ((isNull(emi.bounceChargeDelta) && req.body.bounceCharge <= emi.bounceCharges)
                || (!isNull(emi.bounceChargeDelta) && req.body.bounceCharge <= emi.bounceChargeDelta)) {
                let amount = 0;
                if (emi.bounceChargeDelta) {
                    amount = emi.bounceChargeDelta - req.body.bounceCharge
                } else {
                    amount = emi.bounceCharges - req.body.bounceCharge
                }

                if (amount > 0) {
                    emi.bounceWaived = true;
                    emi.bounceChargesOverridden = req.body.bounceCharge;
                    emi.bounceChargeDelta = req.body.bounceCharge;
                    emi = logUpdatedBy(req, emi);
                    PromiseList.push(db.WaiverRemark.create({
                        emiId: emi.id,
                        waiverType: 'BOUNCE',
                        amount: amount,
                        remark: req.body.waiverRemark,
                        ...logCreatedBy(req)
                    }, oTransactionHandler.transaction));
                }
            }

            let { penalty, charges, emiAmount } = loan.LoanEmis.reduce((summary, emi) => {
                let currentPenalty = emi.penaltyAmount - emi.penaltyAmountPaid;
                let currentBounceCharge = emi.bounceCharges - emi.bounceChargeAmountPaid;

                if (emi.penaltyWaived) {
                    if (isNull(emi.penaltyDelta)) {
                        currentPenalty = emi.penaltyAmountOverridden;
                    } else {
                        currentPenalty = emi.penaltyDelta;
                    }
                }

                if (emi.bounceWaived) {
                    if (isNull(emi.bounceChargeDelta)) {
                        currentPenalty = emi.bounceChargesOverridden;
                    } else {
                        currentPenalty = emi.bounceChargeDelta;
                    }
                }

                const partiallyPaid = emi.status === "Partially Paid";

                summary.penalty += currentPenalty;
                summary.bounceCharges += currentBounceCharge;
                summary.emiAmount += partiallyPaid ? emi.deltaEmiAmount : emi.emiAmount;

                return summary;
            }, { penalty: 0, bounceCharges: 0, emiAmount: 0 });

            // Update the loan penalty charges and bounce changes
            loan.totalPenaltyCharges = penalty;
            loan.totalBounceCharges = charges;
            loan.pendingRecovery = emiAmount;

            PromiseList.push(emi.save({ transaction: oTransactionHandler.transaction }))
            PromiseList.push(loan.save({ transaction: oTransactionHandler.transaction }))

            await Promise.all(PromiseList);

            await oTransactionHandler.commit();
            sendSuccessResponse(res, await getSummary2(loan), LOANS_EMI_PENALTY_WAIVED_OFF);
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }
    }

    /**
     * Once the loan application is completed, techfino can attach the insurance cover note to the
     * loan application if the customer is opted for it.
     * @param req
     * @param res
     */
    static async uploadInsuranceCover(req: Request, res: Response) {
        try {
            // Check multer has successfully parsed the insurance cover file
            if (!req.file) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_FILE_MISSING, BAD_REQUEST);

            // Check for the mime type
            if ([...mimes.docs, ...mimes.images].indexOf(req.file.mimetype) === -1) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_UNKNOWN_MIME, BAD_REQUEST);
            }

            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'pathToCoverNoteS3'],
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, NOT_FOUND);
            }

            // Prepare the S3 path
            let s3Path = s3ObjectName('LA', loan.LoanApplication.id, 'INSURANCE_COVER', req.file.mimetype);

            // Upload to S3
            await s3Upload(req.file.buffer, s3Path, req.file.mimetype);

            // Upload the loan application path to cover note.
            await db.LoanApplication.update({ pathToCoverNoteS3: s3Path }, {
                where: { id: loan.LoanApplication.id }
            });

            return sendSuccessResponse(res, { path: s3Path }, LOAN_APPLICATION_COVER_NOTE_UPLOADED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Attach the invoice for the service
     * @param req
     * @param res
     */
    static async uploadInvoice(req: Request, res: Response) {
        try {
            // Check multer has successfully parsed the file
            if (!req.file) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_FILE_MISSING, BAD_REQUEST);

            // Check for the mime type
            if ([...mimes.docs, ...mimes.images, ...mimes.html].indexOf(req.file.mimetype) === -1) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_UNKNOWN_MIME, BAD_REQUEST);
            }

            let loan = await db.Loan.findOne({
                attributes: ['id'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'pathToInvoiceS3'],
                    required: false
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, NOT_FOUND);
            }

            // Prepare the S3 path
            let s3Path = s3ObjectName('LA', loan.LoanApplication.id, 'INVOICE' + randomBytes(5).toString("hex"), req.file.mimetype);

            // Upload to S3
            await s3Upload(req.file.buffer, s3Path, req.file.mimetype);

            loan.LoanApplication.pathToInvoiceS3 = s3Path;
            await loan.LoanApplication.save();

            await db.LoanInvoice.create({
                s3PathToAdditionalDocuments: s3Path,
                loanApplicationId: loan.LoanApplication.id,
                description: "NIL",
                title: "Invoice",
                ...logCreatedBy(req)
            });

            return sendSuccessResponse(res, { path: s3Path }, LOAN_APPLICATION_INVOICE_UPLOADED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async uploadAddressProof(req: Request, res: Response) {
        try {
            // Check multer has successfully parsed the file
            if (!req.file) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_FILE_MISSING, BAD_REQUEST);

            // Check for the mime type
            if ([...mimes.docs, ...mimes.images].indexOf(req.file.mimetype) === -1) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_UNKNOWN_MIME, BAD_REQUEST);
            }

            let loan = await db.Loan.findOne({
                where: { id: req.params.id },
                attributes: ['id'],
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'addressProofBackPathS3', 'addressProofFrontPathS3'],
                    include: [{
                        model: db.Customer,
                        attributes: ['id', 'addressProofBackPathS3', 'addressProofFrontPathS3'],
                        required: false
                    }]
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, NOT_FOUND);
            }

            // Prepare the S3 path
            let s3Path = s3ObjectName('LA', req.params.id, 'ADDRESS_PROOF', req.file.mimetype);

            // Upload to S3
            await s3Upload(req.file.buffer, s3Path, req.file.mimetype);

            if (isDefined(req.body.type, true) && req.body.type === 'back') {
                loan.LoanApplication.addressProofBackPathS3 = s3Path;
                if (loan.LoanApplication.Customer && !loan.LoanApplication.Customer.addressProofBackPathS3) {
                    loan.LoanApplication.Customer.addressProofBackPathS3 = s3Path;
                }
            } else {
                loan.LoanApplication.addressProofFrontPathS3 = s3Path;
                if (loan.LoanApplication.Customer && !loan.LoanApplication.Customer.addressProofFrontPathS3) {
                    loan.LoanApplication.Customer.addressProofFrontPathS3 = s3Path;
                }
            }

            await Promise.all([
                await loan.LoanApplication.save(),
                await loan.LoanApplication.Customer.save(),
            ]);

            return sendSuccessResponse(res, { path: s3Path }, LOAN_APPLICATION_ADDRESS_PROOF_NOTE_UPLOADED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async uploadIdProof(req: Request, res: Response) {
        try {
            // Check multer has successfully parsed the file
            if (!req.file) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_FILE_MISSING, BAD_REQUEST);

            // Check for the mime type
            if ([...mimes.docs, ...mimes.images].indexOf(req.file.mimetype) === -1) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_UNKNOWN_MIME, BAD_REQUEST);
            }

            let loan = await db.Loan.findOne({
                where: { id: req.params.id },
                attributes: ['id'],
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'idProofBackPathS3', 'idProofFrontPathS3'],
                    include: [{
                        model: db.Customer,
                        attributes: ['id', 'idProofBackPathS3', 'idProofFrontPathS3'],
                        required: false
                    }]
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, NOT_FOUND);
            }

            // Prepare the S3 path
            let s3Path = s3ObjectName('LA', req.params.id, 'ID_PROOF', req.file.mimetype);

            // Upload to S3
            await s3Upload(req.file.buffer, s3Path, req.file.mimetype);

            if (isDefined(req.body.type, true) && req.body.type === 'back') {
                loan.LoanApplication.idProofBackPathS3 = s3Path;
                if (loan.LoanApplication.Customer && !loan.LoanApplication.Customer.idProofBackPathS3) {
                    loan.LoanApplication.Customer.idProofBackPathS3 = s3Path;
                }
            } else {
                loan.LoanApplication.idProofFrontPathS3 = s3Path;
                if (loan.LoanApplication.Customer && !loan.LoanApplication.Customer.idProofFrontPathS3) {
                    loan.LoanApplication.Customer.idProofFrontPathS3 = s3Path;
                }
            }

            await Promise.all([
                await loan.LoanApplication.save(),
                await loan.LoanApplication.Customer.save(),
            ]);

            return sendSuccessResponse(res, { path: s3Path }, LOAN_APPLICATION_ID_PROOF_UPLOADED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Mark a loan as closed (Pre-Closure)
     * @param req 
     * @param res 
     */
    static async markAsClosed(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                where: { id: req.params.id },
                include: [{
                    model: db.LoanEmi
                }, {
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }, {
                    model: db.Customer,
                    attributes: ['id', 'principalOutstanding']
                }]
            });

            let initiatedBy = await db.User.findOne({
                attributes: ['id', 'firstName', 'lastName'],
                where: {
                    id: req.user.id
                }
            })

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            // check the status and notify the user if the loan is already closed
            if (loan.status.toUpperCase() === 'CLOSED' || loan.status.toUpperCase() === 'CANCELLED') {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_ALREADY_CLOSED, 400);
            }

            let closureType = "CLOSE";
            if (req.body.closureType) {
                if (["CLOSE", "CANCEL"].indexOf(req.body.closureType) !== -1) {
                    closureType = req.body.closureType;
                } else {
                    return sendErrorResponse(res, ERROR_MESSAGES.LOAN_CLOSURE_INVALID_TYPE, 400);
                }
            }

            let closureTypeCondition: any = {
                closureType: "CLOSE",
                [db.Sequelize.Op.or]: [{
                    requestorType: "INITIATOR"
                }, {
                    requestorType: null
                }],
                isRejected: 0
            };

            if (closureType === "CANCEL") {
                closureTypeCondition = {
                    closureType: "CANCEL",
                    [db.Sequelize.Op.or]: [{
                        requestorType: "INITIATOR"
                    }, {
                        requestorType: null
                    }],
                    isRejected: 0
                };
            }

            // Fetch the close state of a particular loan
            let closeLoanState = await db.CloseLoanState.findOne({
                where: {
                    loanId: loan.id,
                    ...closureTypeCondition
                },
            });

            if (!closeLoanState && req.body.reject === true) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_CLOSURE_NOT_INITIATED, 400);
            }

            if (closeLoanState && closeLoanState.user === req.user.id && req.body.reject === true) {
                loan.subStatus = null;
                closeLoanState.isRejected = true;
                closeLoanState.rejectRemark = req.body.comments.remark || "";

                await Promise.all([
                    closeLoanState.save(),
                    loan.save()
                ]);
                return sendSuccessResponse(res, {}, LOAN_CLOSER_REJECTED);
            }

            if (closeLoanState && closeLoanState.user === req.user.id) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_CAN_NOT_BE_CLOSED, 400);
            }

            let message = LOAN_CLOSER_REQUEST_INITIATED;

            await oTransactionHandler.getTransaction();

            if (!closeLoanState) {
                loan.subStatus = "CLOSURE_INITIATED";
                loan.closeCancelRemarks = req.body.comments.remark ? req.body.comments.remark : "No Comments";

                await Promise.all([
                    db.CloseLoanState.create({
                        loanId: loan.id,
                        user: req.user.id,
                        remark: req.body.comments.remark,
                        actionDate: req.body.actionDate || new Date(),
                        closureType: closureType,
                        requestorType: "INITIATOR",
                        isRejected: 0,
                        rejectRemark: "",
                        ...logCreatedBy(req)
                    }, { transaction: oTransactionHandler.transaction }),
                    loan.save({ transaction: oTransactionHandler.transaction })
                ]);

                let emailRecipientList = JSON.parse(process.env.CANCELLATION_EMAIL_RECIPIENT_LIST);

                let users = await db.User.findAll({
                    attributes: ['id', 'firstName', 'lastName', 'emailId'],
                    where: {
                        id: { [Sequelize.Op.ne]: req.user.id },
                        emailId: { [Sequelize.Op.in]: emailRecipientList }
                    },
                    include: [{
                        model: db.Role,
                        attributes: ['id', 'role'],
                        where: {
                            role: "SYSTEM_ADMIN"
                        }
                    }]
                });
                const subject = template(LOAN_CLOSER_INITIATED)({ loanNo: loan.loanNumber, closureType: closureType == 'CLOSE' ? 'closure' : 'cancellation' });
                const emailBody = await db.Template.findOne({ where: { name: 'EMAIL_AFTER_INITIATING_LOAN_CLOSER' } });

                // Send Email to other admins after initiating a loan closer
                await Promise.all(users.map((user: any) => sendEmail([user.emailId], subject, template(emailBody.content)({
                    fullName: user.firstName + " " + user.lastName,
                    loanNo: loan.loanNumber,
                    initiatedBy: initiatedBy.firstName + " " + initiatedBy.lastName,
                    closureType: closureType == 'CLOSE' ? 'closure' : 'cancellation'
                }))));
            }

            if (closeLoanState && req.body.reject === true) {
                loan.subStatus = null;
                closeLoanState.isRejected = true;
                closeLoanState.rejectRemark = req.body.comments.remark || "";

                await Promise.all([
                    closeLoanState.save(),
                    loan.save({ transaction: oTransactionHandler.transaction })
                ]);
                message = LOAN_CLOSER_REJECTED;
            } else if (closeLoanState) {
                loan.subStatus = null;
                loan.status = closureType === "CLOSE" ? "closed" : "cancelled";
                loan.closeCancelRemarks = req.body.comments.remark ? req.body.comments.remark : loan.closeCancelRemarks;
                loan.closedAt = closeLoanState.actionDate || new Date();

                const calculatePrincipal = (emi: number, delta: number, interest: number) => {
                    let amount = emi - delta - interest;
                    return amount < 0 ? 0 : amount
                }

                let principalPaid = loan.LoanEmis.reduce((paid: number, emi: any) => {
                    if (emi.status == "Paid") {
                        return paid;
                    }

                    const partiallyPaid = emi.status === "Partially Paid";
                    let emiAmount = partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount;

                    emi.deltaEmiAmount = 0;

                    const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                    const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                    paid += currentPrincipal - previousPrincipal;
                    return paid;
                }, 0);

                await Promise.all([
                    db.CloseLoanState.create({
                        loanId: loan.id,
                        user: req.user.id,
                        closureType: closureType,
                        remark: req.body.comments.remark,
                        requestorType: "APPROVER",
                        isRejected: 0,
                        rejectRemark: "",
                        ...logCreatedBy(req)
                    }, { transaction: oTransactionHandler.transaction }),
                    //db.CloseLoanState.destroy({ where: { loanId: loan.id }, transaction }),
                    db.CustomerPayments.create({
                        customer: loan.consumer,
                        amount: loan.pendingRecovery,
                        paymentType: CUSTOMER_PAYMENT_EMI,
                        paymentMode: PRE_CLOSURE,
                        paidAt: new Date(),
                        loanApplicationId: loan.loanApplicationId,
                        loanId: loan.id,
                        ...logCreatedBy(req)
                    }, { transaction: oTransactionHandler.transaction }),
                    db.LoanEmi.update({ status: 'Paid', deltaEmiAmount: 0 }, {
                        where: {
                            loanId: loan.id,
                        },
                        transaction: oTransactionHandler.transaction
                    })
                ]);

                loan.pendingRecovery = 0;

                if (loan.principalOutstanding - principalPaid <= 20) {
                    principalPaid += loan.principalOutstanding - principalPaid
                }

                await Promise.all([
                    loan,
                    loan.Customer,
                    loan.LoanApplication.Branch,
                    loan.LoanApplication.Branch.Partner,
                    loan.LoanApplication.Branch.Partner.Service,
                    loan.LoanApplication.Branch.Partner.Service.Sector,
                ].map((model: any) => {
                    model.principalOutstanding -= principalPaid;
                    return model.save({ transaction: oTransactionHandler.transaction });
                }));

                message = LOANS_MARK_AS_PAID_SUCCESS;
            }

            await oTransactionHandler.commit();

            return sendSuccessResponse(res, {}, message);
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e)
        }
    }

    static async sendNocMail(req: Request, res: Response) {
        try {
            let loan = await db.Loan.findOne({
                attributes: ['id', 'loanNumber', 'status', 'createdAt'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'organizationId', 'consumer']
                }, {
                    model: db.Customer,
                    attributes: ['email', 'fullName']
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }


            let emailBody = await db.Template.findOne({ where: { name: 'LOAN_NOC_EMAIL' } });

            let subject = template(LOAN_NOC_EMAIL)({ appName: APP_NAME });

            var date = new Date();
            var customerName;
            var loanNumber;
            var dateOfLoanApplied;
            var todayDate = date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear();
            var pdfName = `${customerName}-${loanNumber}-${dateOfLoanApplied}.pdf`;

            let docHTML: any = contentOfNocToCustomer(loan);
            var pdfName = `${loan.loanNumber}.pdf`;

            sendEmail([loan.Customer.email], subject, docHTML, false);

            return sendSuccessResponse(res, {}, "NOC mail sent.");
        }
        catch (e) {
            internalServerError(res, e)
        }
        return true;
    }

    static async sendAutoDebitConfigLink(req: Request, res: Response) {
        try {
            let loan = await db.Loan.findOne({
                attributes: ['id', 'eNachToken', 'loanNumber'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'accessToken', 'accessTokenExpiresAt', 'organizationId']
                }, {
                    model: db.Customer,
                    attributes: ['id', 'fullName', 'mobile', 'email']
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            if (loan.eNachToken) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_EMANDATE_REGISTERED, BAD_REQUEST);
            }

            let url = [process.env.CUSTOMER_CLIENT_PATH, LOAN_ENACH_REGISTRATION, loan.LoanApplication.accessToken].join('');
            loan.LoanApplication.accessTokenExpiresAt = moment().add(7, "days").toDate();

            await loan.LoanApplication.save();

            let bitlyLink = await generateBitlyLink(url);

            // Fetch the OTP SMS template
            let OTPMessageTemplate = await db.Template.findOne({ where: { name: 'LOAN_REGISTER_ENACH_SMS', organizationId: loan.LoanApplication.organizationId } });

            let data = {
                fullName: loan.Customer.fullName,
                loanNumber: loan.loanNumber,
                bitly: bitlyLink.url
            };
            // Render the OTP message from template
            let smsMessage = template(OTPMessageTemplate.content)(data);

            // Sending email with customer id
            let emailBody = await db.Template.findOne({ where: { name: 'LOAN_REGISTER_ENACH_EMAIL', organizationId: loan.LoanApplication.organizationId } });

            let subject = template(ENACH_REGISTRATION)({ appName: APP_NAME });

            // Sent early response to the client
            sendSuccessResponse(res, {}, LOANS_AUTO_DEBIT_REGISTRATION_LINK_SENT);

            await Promise.all([
                await sendSMS(loan.Customer.mobile, smsMessage),
                sendEmail([loan.Customer.email], subject, template(emailBody.content)(data))
            ]);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async bulkOfflineEMIPayment(req: Request, res: Response) {
        const offlineEmiPayments = req.body.map(offlineEmiPayment => ({
            loanId: offlineEmiPayment[0],
            paymentAmount: offlineEmiPayment[1],
            method: offlineEmiPayment[2],
            userId: req.user.id,
            remark: offlineEmiPayment[3],
            paidAt: offlineEmiPayment[4]
        }));
        const isSuccess = await Controller._offlineEMIPayments(offlineEmiPayments);
        if (isSuccess) {
            return sendSuccessResponse(res, {}, 'Bulk Offline EMI Payment is Successful');
        }
        return sendErrorResponse(res, `Failed to process bulk EMI offline payments`, BAD_REQUEST);
    }

    static async bulkSubventionPayment(req: Request, res: Response) {
        function toSubventionPayment([loanId, utrNumber, paidAt, remark]) {
            return { loanId, utrNumber, paidAt, remark };
        }
        const subventionPayments = req.body.map(toSubventionPayment);
        const isSuccess = await Controller._subvPaid(req, res, subventionPayments);
        if (isSuccess) {
            return sendSuccessResponse(res, {}, 'Bulk subvention payment is Successful');
        }
        return sendErrorResponse(res, 'Failed to process bulk subvention payments', BAD_REQUEST);
    }

    static async bulkOfflineEMIPresentationUpdate(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        await oTransactionHandler.getTransaction();

        try {
            const paymentModeMaster = await db.CustomerPaymentModeMaster.findOne({
                where: {
                    isActive: 1,
                    name: "ENACH_MODE"
                }
            });
            const succesfulRequests = req.body.customerPayments.filter(customerPayment => customerPayment[6]),
                failedRequests = req.body.customerPayments.filter(customerPayment => !customerPayment[6]);
            const customerPayments = succesfulRequests.map(customerPayment => ({
                amount: customerPayment[0] / 100,
                loanId: customerPayment[1],
                loanApplicationId: customerPayment[2],
                paymentType: customerPayment[3],
                customer: customerPayment[4],
                rpOrderId: customerPayment[5],
                rpPaymentId: customerPayment[6],
                paymentMode: paymentModeMaster.id,
                paidAt: new Date(),
                ...logCreatedBy(req)
            }));
            const customerPaymentsMap = await db.CustomerPayments.bulkCreate(customerPayments, { transaction: oTransactionHandler.transaction });
            let loanEmis = await db.LoanEmi.findAll({
                where: {
                    loanId: {
                        [db.Sequelize.Op.in]: customerPayments.map(customerPayment => customerPayment.loanId)
                    },
                    $and: db.sequelize.where(db.sequelize.fn('date', db.sequelize.col('dueDate')), '=', req.body.emiDate)
                },
                attributes: ['id', 'loanId', 'paymentId', 'updatedAt']
            });
            await Promise.all(loanEmis.map(loanEmi => {
                const customerPaymentToBeProcessed = customerPaymentsMap.find(customerPayment => customerPayment.loanId == loanEmi.loanId);
                loanEmi.paymentId = customerPaymentToBeProcessed.id;
                loanEmi.updatedAt = new Date();
                return loanEmi.save({ transaction: oTransactionHandler.transaction });
            }));
            // Update bounce charges for the failed Presentations
            let unsuccessfulLoans = await db.Loan.findAll({
                where: {
                    id: {
                        [db.Sequelize.Op.in]: failedRequests.map(customerPayment => customerPayment[1])
                    }
                },
                attributes: ['id', 'totalBounceCharges', 'updatedAt', 'organizationId'],
                include: [{
                    model: db.LoanEmi,
                    where: db.sequelize.where(db.sequelize.fn('date', db.sequelize.col('dueDate')), '=', req.body.emiDate),
                    attributes: ['id', 'bounceWaived', 'bounceChargesOverridden', 'bounceCharges', 'totalAmount', 'penaltyAmount', 'emiAmount', 'updatedAt']
                }]
            });
            let settings = await db.GlobalSetting.findOne({ where: { isActive: true } }), promises = [];
            for (let unsuccessfulLoan of unsuccessfulLoans) {
                const loanEmi = unsuccessfulLoan.LoanEmis[0];
                if (loanEmi.bounceWaived != 1) {
                    unsuccessfulLoan.updatedAt = new Date();
                    loanEmi.bounceChargesOverridden = loanEmi.bounceCharges = settings.bounceChargeRate;
                    unsuccessfulLoan.totalBounceCharges = unsuccessfulLoan.totalBounceCharges + loanEmi.bounceChargesOverridden;
                    loanEmi.totalAmount = loanEmi.bounceChargesOverridden + loanEmi.penaltyAmount + loanEmi.emiAmount;
                    loanEmi.updatedAt = new Date();
                    promises = [...promises, unsuccessfulLoan.save({ transaction: oTransactionHandler.transaction }), loanEmi.save({ transaction: oTransactionHandler.transaction })];
                }
            }
            await Promise.all(promises);
            await oTransactionHandler.commit();
            sendSuccessResponse(res, {}, 'Bulk Offline EMI Presentation Update Done!!');
        } catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }
    }

    static async offlineEMIPayment(req: Request, res: Response) {
        const offlineEmiPayment: OfflineEmiPayment = {
            loanId: req.params.id,
            paymentAmount: req.body.paymentAmount,
            method: req.body.method,
            userId: req.user.id,
            remark: req.body.remark,
            paidAt: req.body.paidAt
        };
        const isSuccess = await Controller._offlineEMIPayments([offlineEmiPayment]);
        if (!isSuccess) {
            internalServerError(res, Error('Please check logs'));
        } else {
            sendSuccessResponse(res, {}, 'Offline payment has been successful');
        }
    }

    private static async _offlineEMIPayments(offlineEmiPayments: any) {
        let oTransactionHandler = new TransactionHandler();
        await oTransactionHandler.getTransaction();

        try {
            // Fetch the information about the loan
            let loans = await db.Loan.findAll({
                where: { id: { [db.Sequelize.Op.in]: offlineEmiPayments.map(offlineEmiPayment => offlineEmiPayment.loanId) } },
                attributes: ['id', 'loanApplicationId', 'principalOutstanding', 'subStatus', 'status', 'closedAt', 'consumer', 'lastPaymentMade', 'pendingRecovery'],
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }, {
                    model: db.LoanEmi,
                    required: false,
                }, {
                    model: db.Customer,
                    required: false,
                    attributes: ['id', 'principalOutstanding', 'mobile']
                }]
            });

            for (let loan of loans) {

                const offlineEmiPayment = offlineEmiPayments.find(offEmiPay => offEmiPay.loanId == loan.id);

                let paidAmount = parseInt(offlineEmiPayment.paymentAmount), changedEmis = [];

                const calculatePrincipal = (emi: number, delta: number, interest: number) => {
                    let amount = emi - delta - interest;
                    return amount < 0 ? 0 : amount;
                }

                let principalPaid = 0, adjustedInstallmentStart = null, adjustedInstallmentEnd = 0,
                    penaltyEmis = [], bounceEmis = [];

                let dueEmis = loan.LoanEmis.filter(emi => emi.status != "Not Due"),
                    notDueEmis = loan.LoanEmis.filter(emi => emi.status == "Not Due");

                // Step 1: Process only EMI for all the due(includes Not Paid, Partially Paid, Paid) EMIs
                for (const [index, emi] of dueEmis.entries()) {
                    const { penalty, bounce } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                    // Push the EMIs to corresponding buckets
                    penalty > 0 && penaltyEmis.push(emi);
                    bounce > 0 && bounceEmis.push(emi);
                    // Make sure customer has paid EMI, Penalty and Bounce components of the EMI explicitly
                    if (emi.status === "Paid") {
                        continue;
                    }

                    if (paidAmount <= 0) {
                        // break out the loop if the paid become 0.
                        break;
                    }

                    const partiallyPaid = emi.status === "Partially Paid";

                    let emiAmount = partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount;

                    // To check, It has recorded any deduction for this EMI
                    if (paidAmount >= emiAmount) {
                        emi.status = "Paid";
                    } else {
                        emi.status = "Partially Paid";
                    }

                    let emiAmountPaid = emi.paidAmount;

                    if (paidAmount > 0 && emiAmount > 0) {
                        if (paidAmount >= emiAmount) {
                            emi.deltaEmiAmount = 0;
                            paidAmount -= emiAmount;
                            emiAmountPaid += emiAmount;
                        } else {
                            emi.deltaEmiAmount = (partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount) - paidAmount;
                            emiAmountPaid += paidAmount;
                            paidAmount = 0;
                        }
                        const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                        const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                        principalPaid += currentPrincipal - previousPrincipal;
                    }

                    emi.paidAmount = emiAmountPaid;

                    const emiExist = changedEmis.find(changedEmi => changedEmi.id == emi.id);
                    emiExist || changedEmis.push(emi);

                }

                // Step 2: Process only Penalty for all the due(includes Not Paid, Partially Paid, Paid) EMIs
                for (const [index, emi] of penaltyEmis.entries()) {
                    if (paidAmount <= 0) {
                        // break out the loop if the paid become 0.
                        break;
                    }
                    const { penalty } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                    if (penalty > 0) {
                        if (paidAmount >= penalty) {
                            emi.penaltyDelta = 0;
                            emi.penaltyAmountPaid += penalty;
                            paidAmount -= penalty;
                            emi.paidAmount += penalty;
                        } else {
                            emi.penaltyAmountPaid += paidAmount;
                            emi.penaltyDelta = penalty - paidAmount;
                            emi.paidAmount += paidAmount;
                            paidAmount = 0;
                        }
                        const emiExist = changedEmis.find(changedEmi => changedEmi.id == emi.id);
                        emiExist || changedEmis.push(emi);
                    }
                }

                // Step 3: Process only Bounce for all the due(includes Not Paid, Partially Paid, Paid) EMIs
                for (const [index, emi] of bounceEmis.entries()) {
                    if (paidAmount <= 0) {
                        // break out the loop if the paid become 0.
                        break;
                    }
                    const { bounce } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                    if (paidAmount > 0 && bounce > 0) {
                        if (paidAmount >= bounce) {
                            emi.bounceChargeDelta = 0;
                            emi.bounceChargeAmountPaid += bounce;
                            paidAmount -= bounce;
                            emi.paidAmount += bounce;
                        } else {
                            emi.bounceChargeAmountPaid += paidAmount;
                            emi.bounceChargeDelta = bounce - paidAmount;
                            emi.paidAmount += paidAmount;
                            paidAmount = 0;
                        }
                        const emiExist = changedEmis.find(changedEmi => changedEmi.id == emi.id);
                        emiExist || changedEmis.push(emi);
                    }
                }

                // Step 4: Process only EMI for all the not due EMIs
                for (const [index, emi] of notDueEmis.entries()) {
                    if (paidAmount <= 0) {
                        // break out the loop if the paid become 0.
                        break;
                    }
                    let emiAmount = emi.emiAmount;
                    // To check, It has recorded any deduction for this EMI
                    if (paidAmount >= emiAmount) {
                        emi.status = "Paid";
                    } else {
                        emi.status = "Partially Paid";
                    }
                    let emiAmountPaid = emi.paidAmount;
                    if (paidAmount >= emiAmount) {
                        emi.deltaEmiAmount = 0;
                        paidAmount -= emiAmount;
                        emiAmountPaid += emiAmount;
                    } else {
                        emi.deltaEmiAmount = emi.emiAmount - paidAmount;
                        emiAmountPaid += paidAmount;
                        paidAmount = 0;
                    }
                    const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                    const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                    principalPaid += currentPrincipal - previousPrincipal;
                    emi.paidAmount = emiAmountPaid;
                    changedEmis.push(emi);
                }

                //adjustedInstallmentStart = changedEmis[0].emiNumber;
                //adjustedInstallmentEnd = changedEmis[changedEmis.length - 1].emiNumber;

                const changedEmisPromise = changedEmis.map(changedEmi => changedEmi.save({ transaction: oTransactionHandler.transaction }));

                let isAllEmisPaid = true, isOverallPenaltyAndBouncePaid = true;
                for (const [index, emi] of loan.LoanEmis.entries()) {
                    if (emi.status != 'Paid') {
                        isAllEmisPaid = false;
                        break;
                    }
                    const { penalty, bounce } = Controller._getPenaltyAndBounceChargesOfEMI(emi);
                    if (penalty > 0 || bounce > 0) {
                        isOverallPenaltyAndBouncePaid = false;
                        break;
                    }
                }

                if (isAllEmisPaid && isOverallPenaltyAndBouncePaid) {
                    loan.subStatus = null;
                    loan.status = "closed";
                    loan.closedAt = new Date();
                    if (loan.principalOutstanding - principalPaid <= 20) {
                        principalPaid += loan.principalOutstanding - principalPaid;
                    }
                }

                await Promise.all(changedEmisPromise);

                // check if payment mode is in CHEQUE, CASH, FUND_TRANSFER, PAYMENT_GATEWAY_MANUAL_TRANSFER or OTHERS
                let customerPaymentMode = await db.CustomerPaymentModeMaster.findOne({ where: { name: offlineEmiPayment.method } });

                // Update the database with the transaction information
                let customerPayment = await db.CustomerPayments.create({
                    customer: loan.consumer,
                    amount: offlineEmiPayment.paymentAmount,
                    paymentType: EMI,
                    paymentMode: customerPaymentMode.id, // The mode of payment is  Offline as this payment was done at customer panel
                    paidAt: offlineEmiPayment.paidAt,
                    loanApplicationId: loan.LoanApplication.id,
                    loanId: loan.id,
                    createdAt: new Date,
                    updatedAt: new Date,
                    createdBy: offlineEmiPayment.userId,
                    remark: offlineEmiPayment.remark
                }, { transaction: oTransactionHandler.transaction });


                // Change the loan's last payment made date to today.
                loan.lastPaymentMade = new Date();
                loan.pendingRecovery -= paidAmount;

                await Promise.all([
                    loan,
                    loan.Customer,
                    loan.LoanApplication.Branch,
                    loan.LoanApplication.Branch.Partner,
                    loan.LoanApplication.Branch.Partner.Service,
                    loan.LoanApplication.Branch.Partner.Service.Sector,
                ].map((model: any) => {
                    model.principalOutstanding -= principalPaid;
                    return model.save({ transaction: oTransactionHandler.transaction });
                }));

                // Send the customer id by sms.
                if (false) {
                    let messageBody = await db.Template.findOne({ where: { name: 'SEND_SMS_FOR_EMI_PAYMENT_DONE' } });
                    let smsMessage = template(messageBody.content)({
                        amount: customerPayment.amount,
                        emiList: formSentence(adjustedInstallmentStart, adjustedInstallmentEnd)
                    });

                    await Promise.all([
                        sendSMS(loan.Customer.mobile, smsMessage),
                    ]);
                }
            }
            await oTransactionHandler.commit();
            return true;
        }
        catch (e) {
            await oTransactionHandler.rollback();
            console.error(`Offline Payment Error: -> `, e);
            return false;
        }
    }
    /**
     * upload additional documents pertaining to a loan
     * @param req
     * @param res
     */
    static async uploadAdditionalDocs(req: Request, res: Response) {
        try {
            // Check multer has successfully parsed the file
            if (!req.file) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_FILE_MISSING, BAD_REQUEST);

            // Check for the mime type
            if ([...mimes.docs, ...mimes.images].indexOf(req.file.mimetype) === -1) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_COVER_NOTE_UNKNOWN_MIME, BAD_REQUEST);
            }

            let loan = await db.Loan.findOne({
                attributes: ["id", "consumer"],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanAdditionalDocuments,
                    required: false
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, NOT_FOUND);
            }

            // Info git - #413 Need to upload documents for the closed loans as per the requirement and should revert this changes later.
            /*if (loan.status === "closed") {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_IS_CLOSED, NOT_FOUND);
            }*/

            // Prepare the S3 path
            let s3Path = s3ObjectName('LA', req.params.id, 'ADDITIONAL_DOC', req.file.mimetype);

            // Upload to S3
            await s3Upload(req.file.buffer, s3Path, req.file.mimetype);

            if (req.body.title === 'VIDEO_KYC') {
                let videoPath = s3ObjectFixedName('LA', loan.consumer, `videoKyc`, `video/webm`);
                await s3Upload(req.file.buffer, videoPath, `video/webm`);
            }
            else if (req.body.title === 'PHOTO_SELFIE') {
                let selfiePath = s3ObjectName('LA', loan.consumer, 'USER_IMAGE', req.file.mimetype);
                await s3Upload(req.file.buffer, selfiePath, req.file.mimetype);
            }
            else if (req.body.title === 'AADHAR_FRONT_COPY') {
                let adharFrontPath = s3ObjectName('LA', loan.consumer, 'AADHAR_FRONT_COPY', req.file.mimetype);
                await s3Upload(req.file.buffer, adharFrontPath, req.file.mimetype);
            }
            else if (req.body.title === 'AADHAR_BACK_COPY') {
                let adharBackPath = s3ObjectName('LA', loan.consumer, 'AADHAR_BACK_COPY', req.file.mimetype);
                await s3Upload(req.file.buffer, adharBackPath, req.file.mimetype);
            }

            await db.LoanAdditionalDocuments.create({
                s3PathToAdditionalDocuments: s3Path,
                loanId: loan.id,
                description: req.body.description,
                title: req.body.title,
                ...logCreatedBy(req)
            });
            
            if (req.body.title === 'PAN') {
                await db.Pan.update(
                    { panImage: buffToBase64(req.file.buffer) },
                    {
                        where: { customerId: loan.consumer }
                    });
            }
            return sendSuccessResponse(res, { path: s3Path }, LOAN_ADDITIONAL_DOCUMENT_UPLOADED);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }
    /**
     * get s3 signed url for all uploaded additional documents pertaining to a loan
     * @param req
     * @param res
     */
    static async getAdditionalDocsSignedURL(req: Request, res: Response) {
        try {
            let loanDocs = await db.LoanAdditionalDocuments.findAll({
                attributes: ['id', 's3PathToAdditionalDocuments', 'title', 'description', 'createdAt'],
                where: { loanId: req.params.id },
            });
            if (!loanDocs) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_NOT_FOUND, NOT_FOUND);
            }
            let url: any = [];
            for (let doc of loanDocs) {
                let docName: any = doc.s3PathToAdditionalDocuments.split("/");
                docName = docName.pop();
                let s3Path = await getSignedURL(doc.s3PathToAdditionalDocuments); // Get the pre-signed s3 path from AWS
                await url.push({ id: doc.id, docName: docName, createdAt: doc.createdAt, title: doc.title, description: doc.description, ["s3Path"]: s3Path, s3PathToAdditionalDocuments: doc.s3PathToAdditionalDocuments })
            }
            return sendSuccessResponse(res, { signed: url.reverse() });
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    private static async getLoanApplicationState(id) {
        return await db.LoanApplication.findOne({
            where: { id: id },
            include: [{
                model: db.Loan,
                required: false
            }, {
                model: db.Customer,
                required: false,
                attributes: { exclude: ['password', 'creditReport'] }
            }, {
                model: db.Branch,
                attributes: ['id', 'name', 'city', 'address1', 'state'],
                include: [{
                    model: db.Partner,
                    attributes: ['id', 'name'],
                    include: [{
                        model: db.Service,
                        attributes: ['id', 'name']
                    }]
                }]
            }]
        });
    }
    /**
     * modify or revert insurance of a particular loan.
     * @param req
     * @param res
     */
    static async revertInsuranceChanges(req: Request, res: Response) {

        // creating sequelize transaction
        let oTransactionHandler = new TransactionHandler();
        try {

            req.params.id = req.params.id || req['loanId'];
            // fetching the loan with request id
            let loan = await db.Loan.findOne({ where: { id: req.params.id } });

            // fetch all related schemas
            let loanApplication = await db.LoanApplication.findOne({
                where: {
                    id: loan.loanApplicationId
                },
                include: [{
                    model: db.Loan
                }, {
                    model: db.Customer,
                    attributes: { exclude: ['creditBureauEnquiryReportId', 'creditBureauEnquiryUniqueRefNo', 'creditBureauRequestedAt', 'creditBureauStatus', 'creditReport'] },
                }, {
                    model: db.Branch,
                    include: [{
                        model: db.Partner,
                        include: [{
                            model: db.Service,
                            include: [{ model: db.Sector }]
                        }]
                    }]
                }]
            });
            // Check if loan application is valid or not.
            if (!loanApplication) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_NOT_FOUND, BAD_REQUEST);

            // Check if any emi is paid or not, proceed further only if no emis are paid.
            if (loanApplication.applyInsurance === false)
                return sendErrorResponse(res, ERROR_MESSAGES.CANNOT_REVERT_INSURANCE, BAD_REQUEST);

            // Check if from date of loan creation to date of cancellation of insurance is more then last allowed date to cancel availed insurance to cancel insurance from loan. 
            if (moment(new Date).diff(loan.createdAt, 'days') > LIMIT_DATE_TO_CANCEL_INSURANCE)
                return sendErrorResponse(res, ERROR_MESSAGES.CANNOT_REVERT_INSURANCE_AFTER_THRESHOLD_DATE_FOR_CANCELLATION, BAD_REQUEST);

            // find the first Emi and change the emiAmount with insurance Amount
            let pendingEMIList = await db.LoanEmi.findAll({
                where: {
                    loanNumber: loanApplication.Loan.loanNumber,
                    status: { [Sequelize.Op.ne]: 'Paid' }
                }
            });
            // check if any emi to be paid exist or not.
            if (!pendingEMIList.length) return sendErrorResponse(res, ERROR_MESSAGES.NO_OUTSTANDING_EMI, BAD_REQUEST);

            await oTransactionHandler.getTransaction();

            const calculatePrincipal = (emi: number, delta: number, interest: number) => {
                let amount = emi - delta - interest;
                return amount < 0 ? 0 : amount
            }

            const isNull = (value: any) => value === null;

            const installmentStatus = pendingEMIList.reduce((accumulator, installment: any) => {
                if (accumulator.insuranceAmount <= 0) {
                    return accumulator;
                }
                const partiallyPaid = installment.status === "Partially Paid";

                let accumulatedPenalty = (installment.penaltyAmount ? installment.penaltyAmount : 0)
                let accumulatedBounceCharges = (installment.bounceCharges ? installment.bounceCharges : 0)

                let penalty = accumulatedPenalty - installment.penaltyAmountPaid;
                let bounceCharges = accumulatedBounceCharges - installment.bounceChargeAmountPaid;

                let currentDelta = partiallyPaid && installment.deltaEmiAmount ? installment.deltaEmiAmount : installment.emiAmount;

                if (installment.penaltyWaived) {
                    if (isNull(installment.penaltyDelta)) {
                        penalty = installment.penaltyAmountOverridden;
                    } else {
                        penalty = installment.penaltyDelta;
                    }
                }

                if (installment.bounceWaived) {
                    if (isNull(installment.bounceChargeDelta)) {
                        bounceCharges = installment.bounceChargesOverridden;
                    } else {
                        bounceCharges = installment.bounceChargeDelta;
                    }
                }

                let totalEmiAmount = penalty + bounceCharges + currentDelta;

                // To check, It has recorded any deduction for this EMI
                if (accumulator.insuranceAmount >= totalEmiAmount) {
                    installment.status = "Paid";
                } else {
                    installment.status = "Partially Paid";
                }

                let emiAmountPaid = installment.paidAmount;
                if (penalty > 0) {
                    if (accumulator.insuranceAmount >= penalty) {
                        installment.penaltyDelta = 0;
                        installment.penaltyAmountPaid += penalty;
                        accumulator.insuranceAmount -= penalty;
                        emiAmountPaid += penalty;
                    } else {
                        installment.penaltyAmountPaid += accumulator.insuranceAmount;
                        installment.penaltyDelta = penalty - accumulator.insuranceAmount;
                        emiAmountPaid += accumulator.insuranceAmount;
                        accumulator.insuranceAmount = 0;
                    }
                }

                if (accumulator.insuranceAmount > 0 && bounceCharges > 0) {
                    if (accumulator.insuranceAmount >= bounceCharges) {
                        installment.bounceChargeDelta = 0;
                        installment.bounceChargeAmountPaid += bounceCharges;
                        accumulator.insuranceAmount -= bounceCharges;
                        emiAmountPaid += bounceCharges;
                    } else {
                        installment.bounceChargeAmountPaid += accumulator.insuranceAmount;
                        installment.bounceChargeDelta = bounceCharges - accumulator.insuranceAmount;
                        emiAmountPaid += accumulator.insuranceAmount;
                        accumulator.insuranceAmount = 0;
                    }
                }

                if (accumulator.insuranceAmount > 0 && currentDelta > 0) {
                    if (accumulator.insuranceAmount >= currentDelta) {
                        installment.deltaEmiAmount = 0;
                        accumulator.insuranceAmount -= currentDelta;
                        emiAmountPaid += currentDelta;
                    } else {
                        installment.deltaEmiAmount = currentDelta - accumulator.insuranceAmount;
                        emiAmountPaid += accumulator.insuranceAmount;
                        accumulator.insuranceAmount = 0;
                    }

                    const previousPrincipal = calculatePrincipal(installment.emiAmount, currentDelta, installment.interest);
                    const currentPrincipal = calculatePrincipal(installment.emiAmount, installment.deltaEmiAmount, installment.interest);

                    accumulator.principal += currentPrincipal - previousPrincipal;
                }
                installment.paidAmount = emiAmountPaid;
                accumulator.updates.push(installment.save({ transaction: oTransactionHandler.transaction }));

                return accumulator;
            }, {
                principal: 0,
                updates: [],
                insuranceAmount: loanApplication.insuranceAmount
            });

            if (installmentStatus.updates && installmentStatus.updates.length) {
                await Promise.all(installmentStatus.updates);
            }

            const entities = [
                loanApplication.Loan,
                loanApplication.Customer,
                loanApplication.Branch,
                loanApplication.Branch.Partner,
                loanApplication.Branch.Partner.Service,
                loanApplication.Branch.Partner.Service.Sector,
            ];

            entities.forEach(async (entity) => {
                entity.principalOutstanding -= installmentStatus.principal ? installmentStatus.principal : 0;
                if (entity.principalOutstanding < 0) {
                    await oTransactionHandler.rollback();
                    return sendErrorResponse(res, PRINCIPAL_OUTSTANDING_CANNOT_BE_NEGATIVE, BAD_REQUEST);
                }
            })
            await Promise.all(entities.map(entity => entity.save({ transaction: oTransactionHandler.transaction })));

            loanApplication.pathToCoverNoteS3 = null;
            loanApplication.applyInsurance = false;
            loanApplication.addInsuranceAmountToEMI = false;

            await db.CustomerPayments.create({
                customer: loan.consumer,
                amount: loanApplication.insuranceAmount,
                paymentType: EMI,
                paymentMode: OTHERS, // The mode of payment is  Offline as this payment was done at customer panel
                paidAt: new Date,
                loanApplicationId: loanApplication.id,
                loanId: loanApplication.Loan.id,
                ...logCreatedBy(req),
                remark: "Compensation to insurance Amount."
            }, { transaction: oTransactionHandler.transaction });


            // check and delete all InsurancePayments records from database
            await db.InsurancePayments.destroy({ where: { loanId: loanApplication.Loan.id } }, { transaction: oTransactionHandler.transaction });

            let emailTemplateString = await db.Template.findOne({ where: { name: 'SCHEDULE_AFTER_REVERT_INSURANCE_EMAIL', organizationId: loanApplication.organizationId } });
            let OTPMessageTemplate = await db.Template.findOne({ where: { name: 'SCHEDULE_AFTER_REVERT_INSURANCE_SMS', organizationId: loanApplication.organizationId } });

            loanApplication.Loan.pendingRecovery -= loanApplication.insuranceAmount;
            loanApplication.insuranceAmount = 0;

            await loanApplication.Loan.save({ transaction: oTransactionHandler.transaction });
            await loanApplication.save({ transaction: oTransactionHandler.transaction });
            await oTransactionHandler.commit();

            // sending success response along with loan application state.
            sendSuccessResponse(res,
                await Controller.getLoanApplicationState(loanApplication.id),
                LOAN_INSURANCE_REVERTED
            );

            let subject = template(CANCELLED_INSURANCE)({
                appName: APP_NAME,
                loanNumber: loanApplication.Loan.loanNumber
            });
            // Sending email with reset password link
            await sendEmail([loanApplication.Customer.email], subject, template(emailTemplateString.content)({
                loanNumber: loanApplication.Loan.loanNumber,
                name: loanApplication.Customer.fullName,
            }));

            await sendSMS(req.body.mobile, template(OTPMessageTemplate.content)({
                loanNumber: loanApplication.Loan.loanNumber,
            }));

        } catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }

    }

    static async captureWebHookEventFromRazorPay(req: Request, res: Response) {
        // implement - 1 // validate the request
        try {
            let reqBody = JSON.stringify(req.body);
            const razorpay = require("razorpay");
            let signature = req.headers["x-razorpay-signature"];
            let validatePayment = razorpay.validateWebhookSignature(reqBody, signature, process.env.RAZORPAY_SECRET);
            let validateEmandate = razorpay.validateWebhookSignature(reqBody, signature, process.env.RAZORPAY_SECRET_ENACH);

            if (!validatePayment && !validateEmandate) {
                let razorPayEvent: IRazorPayEvent = JSON.parse(reqBody);
                let paymentEntityData = (razorPayEvent.payload && razorPayEvent.payload.payment && razorPayEvent.payload.payment.entity);
                let loanApplication = await db.LoanApplication.findOne({
                    limit: 1,
                    where: { id: paymentEntityData.notes.loanApplicationId },
                    include: [{
                        model: db.Organization,
                        attributes: ["id", "razorPayKey", "razorPaySecretKey"]
                    }]
                });
                if (loanApplication && loanApplication.Organization.id != 1) {
                    let razorPayKey = null;
                    let razorPaySecretKey = null;
                    if ((loanApplication.Organization && loanApplication.Organization.razorPayKey) && (loanApplication.Organization && loanApplication.Organization.razorPaySecretKey)) {
                        razorPayKey = decryptText(loanApplication.Organization.razorPayKey);
                        razorPaySecretKey = decryptText(loanApplication.Organization.razorPaySecretKey);
                    }
                    validatePayment = razorpay.validateWebhookSignature(reqBody, signature, razorPayKey);
                    validateEmandate = razorpay.validateWebhookSignature(reqBody, signature, razorPaySecretKey);
                }
            }

            if (validatePayment || validateEmandate) {

                try {
                    // implement - 3 //the response should be given in 5 seconds with 2xx status 
                    // else webhook will consider this as failed and will retry to send 
                    // event for 24 hours in regular interval
                    let razorpayEventIdFromHeader = req.headers["x-razorpay-event-id"];
                    let recordForAnEvent = await db.PaymentEventInformations.findOne({
                        limit: 1,
                        where: { razorpayEventId: razorpayEventIdFromHeader }
                    })
                    if (recordForAnEvent === null) {
                        let razorPayEvent: IRazorPayEvent = JSON.parse(reqBody);
                        const paymentEntity = (razorPayEvent.payload && razorPayEvent.payload.payment && razorPayEvent.payload.payment.entity);
                        if (paymentEntity) {
                            await db.PaymentEventInformations.create({
                                paymentId: paymentEntity.id,
                                eventType: razorPayEvent.event,
                                status: paymentEntity.status,
                                errorCode: paymentEntity.error_code,
                                errorDescription: paymentEntity.error_description,
                                razorpayEventId: razorpayEventIdFromHeader,
                                loanApplicationId: paymentEntity.notes.loanApplicationId || null,
                                loanId: paymentEntity.notes.loanId || null,
                                paymentType: paymentEntity.notes.paymentType || null,
                                paymentMode: paymentEntity.method,
                                ...logCreatedBy(req)
                            });
                        }
                    }
                    return res.status(201).send("ok");
                }
                catch (e) {
                    console.log("razorpay event process failed");
                    return internalServerError(res, e);
                }
            }
            return sendErrorResponse(res, 'razorpay event process failed');
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    static async getWebHookEventData(req: Request, res: Response) {
        try {
            let webhookEventData;

            webhookEventData = await db.PaymentEventInformations.findAll({
                //limit: 1,
                where: { emiId: req.query.emiId }, //add emiid 
                order: [['createdAt', 'DESC']]
            });

            if (!webhookEventData) return sendErrorResponse(res, 'webhook event data not found');

            //send it to the client
            return sendSuccessResponse(res, webhookEventData);
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    static async unMakeEMIPayment(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        req.params.id = req.params.id || req['loanId'];
        try {
            // Fetch the information about the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'principalOutstanding', 'pendingRecovery'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }, {
                    model: db.LoanEmi,
                    required: false,
                }, {
                    model: db.Customer,
                    attributes: ['id', 'principalOutstanding'],
                    required: false,
                }]
            });

            if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);

            // Find the requested EMI from the list
            let emi = loan.LoanEmis.find((installment: any) => installment.id == req.params.emi);

            if (!emi) return sendErrorResponse(res, "EMI Not Found", NOT_FOUND);

            if (emi.status !== "Paid") return sendErrorResponse(res, "Selected EMI Not Paid", NOT_FOUND);

            const changedEmi = [];

            await oTransactionHandler.getTransaction();;

            let emiToBeUpdated = emi;

            emiToBeUpdated.status = "Not Paid";
            emiToBeUpdated.paidAmount = 0;
            emiToBeUpdated.deltaAmount = null;
            emiToBeUpdated.penaltyDelta = null;
            emiToBeUpdated.bounceChargeDelta = null;
            emiToBeUpdated.deltaEmiAmount = null;
            emiToBeUpdated.updatedAt = new Date();

            changedEmi.push(emiToBeUpdated.save({ transaction: oTransactionHandler.transaction }));

            await Promise.all(changedEmi);

            loan.pendingRecovery += emiToBeUpdated.emiAmount;

            await Promise.all([
                loan,
                loan.Customer,
                loan.LoanApplication.Branch,
                loan.LoanApplication.Branch.Partner,
                loan.LoanApplication.Branch.Partner.Service,
                loan.LoanApplication.Branch.Partner.Service.Sector,
            ].map((model: any) => {
                model.principalOutstanding += emiToBeUpdated.emiAmount;
                return model.save({ transaction: oTransactionHandler.transaction });
            }));

            await oTransactionHandler.commit();
            sendSuccessResponse(res, {}, 'Reversal of the payment has been done');
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }
    }

    /**
 * Fetch information about a particular loan device details
 * @param req
 * @param res
 */
    static async getDeviceDetails(req: Request, res: Response) {

        try {
            // Fetch the device details of selected loan
            let deviceDetails = await db.DeviceDetails.findAll({
                where: { loanId: req.params.id }
            });

            sendSuccessResponse(res, deviceDetails);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * updates eNach Token and razorpay customer ID
     * @param req
     * @param res
     */
    static async updateeNachToken(req: Request, res: Response) {
        try {
            // Fetch the information about the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'eNachToken', 'consumer'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Customer,
                        attributes: ['id', 'razorPayCustomerId'],
                    }]
                }]
            });

            if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);

            if (loan.eNachToken == req.body.eNachToken) {
                return sendErrorResponse(res, "EnachToken should not be same as previous");
            }

            loan.eNachToken = req.body.eNachToken;

            loan.LoanApplication.Customer.razorPayCustomerId = req.body.razorPayCustomerId;

            await Promise.all([
                await loan.save(),
                await loan.LoanApplication.Customer.save()
            ]);

            sendSuccessResponse(res, {}, 'eNach Token and Razorpay Customer ID updated successfully');
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    static async bulkEnachUpdate(req: Request, res: Response) {
        const bulkEnach = req.body.reduce((acc, bulkEnach) => {

            acc[bulkEnach[0]] = {
                eNachToken: bulkEnach[1] || "",
                razorPayCustomerId: bulkEnach[2] || ""
            };
            return acc;
        }, {});
        const isSuccess = await Controller._bulkEnachToken(bulkEnach);
        if (isSuccess) {
            return sendSuccessResponse(res, {}, 'Bulk Enachtoken upload is Successful');
        }
        return sendErrorResponse(res, `Failed to upload Enachtoken`, BAD_REQUEST);
    }

    private static async _bulkEnachToken(Enachtoken: any) {
        try {
            // Fetch the information about the loan
            let loans = await db.Loan.findAll({
                attributes: ['id', 'eNachToken', 'consumer'],
                where: { id: { [db.Sequelize.Op.in]: Object.keys(Enachtoken) } },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Customer,
                        attributes: ['id', 'razorPayCustomerId'],
                    }]
                }]
            });

            for await (let loan of loans) {
                let newData = Enachtoken[loan.id];
                //logAdminChanges(req, loan.eNachToken , newData.eNachToken);
                loan.eNachToken = newData.eNachToken;
                await loan.save();
                loan.LoanApplication.Customer.razorPayCustomerId = newData.razorPayCustomerId;
                await loan.LoanApplication.Customer.save();
            }
            return true;
        }

        catch (e) {
            //await oTransactionHandler.rollback();
            console.error(`Bulk Enach Token Error: -> `, e);
            return false;
        }
    }

    static async bulkDispUpdate(req: Request, res: Response) {
        const bulkDisp = req.body.reduce((acc, bulkDisp) => {

            acc[bulkDisp[0]] = {
                dispDate: bulkDisp[1] || "",
            };

            return acc
        }, {});
        const isSuccess = await Controller._bulkDispDateUpdate(bulkDisp);
        if (isSuccess) {
            return sendSuccessResponse(res, {}, 'Bulk Disbursement dates updated succesfully');
        }
        return sendErrorResponse(res, `Failed to update Disbursement date, (Date format should be in YYYY-MM-DD)`, BAD_REQUEST);
    }

    private static async _bulkDispDateUpdate(BulkDate: any) {
        try {
            // Fetch the information about the loan
            let loans = await db.Loan.findAll({
                attributes: ['id', 'disbursedAt'],
                where: { id: { [db.Sequelize.Op.in]: Object.keys(BulkDate) } },
                include: [{
                    model: db.OutBoundPayments,
                    attributes: ['id', 'timestamp']
                }]
            });

            for await (let loan of loans) {
                let newData = BulkDate[loan.id];
                loan.disbursedAt = newData.dispDate;
                await loan.save();

                loan.OutBoundPayments[0].timestamp = moment(newData.dispDate, 'YYYY-MM-DD').toDate();
                await loan.OutBoundPayments[0].save();
            }
            return true;
        }

        catch (e) {
            //await oTransactionHandler.rollback();
            console.error(`Bulk Disbursement date update: -> `, e);
            return false;
        }
    }

    private static _getPenaltyAndBounceChargesOfEMI(emi) {
        let accumulatedPenalty = (emi.penaltyAmount ? emi.penaltyAmount : 0),
            accumulatedBounceCharges = (emi.bounceCharges ? emi.bounceCharges : 0);

        let penalty = accumulatedPenalty - emi.penaltyAmountPaid,
            bounce = accumulatedBounceCharges - emi.bounceChargeAmountPaid;

        const isNull = (value: any) => value === null;

        if (emi.penaltyWaived) {
            if (isNull(emi.penaltyDelta)) {
                penalty = emi.penaltyAmountOverridden;
            } else {
                penalty = emi.penaltyDelta;
            }
        }

        if (emi.bounceWaived) {
            if (isNull(emi.bounceChargeDelta)) {
                bounce = emi.bounceChargesOverridden;
            } else {
                bounce = emi.bounceChargeDelta;
            }
        }

        return {
            penalty,
            bounce
        }
    }

    static async addPaymentAdviceData(req: Request, res: Response) {
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id', 'loanApplicationId'],
                where: { loanNumber: req.params.loanNumber }
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            let paymentAdviceToPartner = await db.LoanPaymentAdviceToPartner.create({
                loanId: loan.id,
                loanApplicationId: loan.loanApplicationId,
                invoiceNo: req.body.invoiceNo,
                productService: req.body.productService,
                fundTransferReferenceId: req.body.fundTransferReferenceId,
                attendanceId: req.body.attendanceId,
                cancellationAmount: req.body.cancellationAmount,
                cancellationReferenceId: req.body.cancellationReferenceId,
                ...logCreatedBy(req)
            })

            await paymentAdviceToPartner.save();
            sendSuccessResponse(res, {}, "The Payment Advice Data has added");

        } catch (e) {
            internalServerError(res, e)
        }
    }

    static async updatePaymentAdviceData(req: Request, res: Response) {
        try {
            // Find the loan
            let loan = await db.Loan.findOne({
                attributes: ['id'],
                where: { loanNumber: req.params.loanNumber },
                include: [{
                    model: db.LoanPaymentAdviceToPartner
                }]
            });

            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
            }

            loan.LoanPaymentAdviceToPartner.invoiceNo = req.body.invoiceNo;
            loan.LoanPaymentAdviceToPartner.productService = req.body.productService;
            loan.LoanPaymentAdviceToPartner.fundTransferReferenceId = req.body.fundTransferReferenceId;
            loan.LoanPaymentAdviceToPartner.attendanceId = req.body.attendanceId;
            loan.LoanPaymentAdviceToPartner.cancellationAmount = req.body.cancellationAmount;
            loan.LoanPaymentAdviceToPartner.cancellationReferenceId = req.body.cancellationReferenceId;

            await loan.LoanPaymentAdviceToPartner.save();

            sendSuccessResponse(res, { loan }, "The Payment Advice Data has updated");

        } catch (e) {
            internalServerError(res, e)
        }
    }

    static async getEKycDetails(req: Request, res: Response) {
        try {
            // Fetch the e-kyc details of selected loan
            let eKycDetails = await db.CustomerEKycs.findOne({
                where: { customerId: req.params.customerId },
                include: [{
                    model: db.Customer,
                    attributes: ['id', 'customerId'],
                    include: [db.DigioEkycRequests]
                }]
            });

            if (!eKycDetails) {
                return sendErrorResponse(res, ERROR_MESSAGES.EKYC_NOT_FOUND, 404);
            }

            if (eKycDetails.videoKycLocation == null || eKycDetails.videoKycMatchResult == null || eKycDetails.selfieMatchRate == null) {
                const digioClient = new DigioClient();
                let kycRequestId = eKycDetails.Customer.DigioEkycRequest.eKycRequestId;

                const digioEkycResponse = await digioClient.getEkycResponse(kycRequestId);

                if (digioEkycResponse.actions) {
                    for (let item of digioEkycResponse.actions) {
                        switch (item.action_ref) {
                            case "digilocker-1":
                                break;
                            case "video-1":
                                if (!eKycDetails.videoKycMatchResult) {
                                    eKycDetails.videoKycMatchResult = item.face_match_result ? item.face_match_result.match_result : null;
                                    eKycDetails.videoKycMatchRate = item.face_match_result ? item.face_match_result.confidence : null;
                                    eKycDetails.updatedAt = new Date();
                                }
                                if (!eKycDetails.videoKycLocation) {
                                    eKycDetails.videoKycLocation = item.sub_actions ? item.sub_actions[0].details.address : null;
                                    eKycDetails.updatedAt = new Date();
                                }
                                
                                break;
                            case "selfie-1":
                                if (!eKycDetails.selfieMatchRate) {
                                    eKycDetails.selfieMatchResult = item.face_match_result ? item.face_match_result.match_result : null;
                                    eKycDetails.selfieMatchRate = item.face_match_result ? item.face_match_result.confidence : null;
                                    eKycDetails.updatedAt = new Date();
                                }
                                break;
                        }
                    }
                }
                await eKycDetails.save();
            }
            sendSuccessResponse(res, eKycDetails);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Download Verified Aadhar report from Digio by KYC request ID.
     * @param req
     * @param res
     */
    static async downloadAadharReport(req: Request, res: Response) {
        try {
            let digioRequestId = req.params.digioRequestId;
            let customerId = req.params.customerId;
            let url: any = 'eKycReports/aadharLog' + `${customerId}.pdf`;
            url = await getSignedURL(url);
            if (!url || url.error === 'file not found') {
                let digioClient = new DigioClient();
                const digioEkycResponse = await digioClient.getEkycResponse(digioRequestId);

                if (!digioEkycResponse || !customerId || !digioEkycResponse.actions[0] || !digioEkycResponse.actions[0].execution_request_id) {
                    return sendErrorResponse(res, ERROR_MESSAGES.EKYC_NOT_FOUND, 404);
                }

                let digioAadharFile = await digioClient.getAadharReport(digioEkycResponse.actions[0].execution_request_id)
                // Upload to S3
                await s3Upload(arrayBufferToBuffer(digioAadharFile), `eKycReports/aadharLog/${customerId}.pdf`, `application/pdf`);
                url = 'eKycReports/aadharLog/' + `${customerId}.pdf`;
                url = await getSignedURL(url);
            }
            sendSuccessResponse(res, url)
        } catch (e) {
            internalServerError(res, e)
        }
    }

    static async getCKycDetails(req: Request, res: Response) {
        try {
            let ckycReport: any = await CKYCService.getCKYCReport(req.params.customerId);
            if (!ckycReport.length || ckycReport.length < 10) {
                try {
                    let customer = await db.Customer.findOne({
                        attributes: ['id', 'customerId', 'dob', 'panNumber'],
                        where: { id: req.params.customerId }
                    });

                    const ckycClient = new cKycClient();
                    const cKycRecord = await ckycClient.searchAndRetriveCkycRecord(customer.panNumber, customer.dob);

                    // Prepare the S3 path.
                    let s3Path = s3ObjectFixedName("cKycRecords", "", req.params.customerId, "text/plain");

                    // Upload to the S3 & Store s3path in cKycRecordPath.
                    let cKyc = JSON.stringify(cKycRecord);
                    await s3Upload(cKyc, s3Path, "text/plain");

                    sendSuccessResponse(res, cKyc);
                } catch (e) {
                    return sendErrorResponse(res, ERROR_MESSAGES.CKYC_NOT_FOUND, 404);
                }
            } else {
                sendSuccessResponse(res, ckycReport);
            }
        } catch (e) {
            internalServerError(res, e);
        }
    }

    static async getMandateDetails(req: Request, res: Response) {
        try {

            let loan = await db.Loan.findOne({
                where: { id: req.params.id },
                attributes: ['id', 'orderId', 'eNachToken', 'digioUmrn', 'razorpayMandatePaymentId', 'organizationId'],
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'eMandatePartner', 'digioMandateId', 'emandate', 'organizationId', 'rpOrderId']
                }, {
                    model: db.Organization,
                    attributes: ['id', 'razorPayKey', 'razorPaySecretKey']
                }]
            });

            // if (loan.digioUmrn) {
            //     let digioMandateDetails = await db.RazorPayMandateDetails.findOne({
            //         where: { loanId: req.params.id }
            //     });
            //     return sendSuccessResponse(res, digioMandateDetails);
            // }

            // Fetch the mandate details of selected loan
            let mandateDetails = await db.RazorPayMandateDetails.findOne({
                where: { loanId: req.params.id }
            });

            if (mandateDetails && mandateDetails.status == 'captured') {
                return sendSuccessResponse(res, mandateDetails);
            }

            if (loan.orderId) {

                let razorPayEnachKey = process.env.RAZORPAY_KEY_ENACH;
                let razorPayEnachSecretKey = process.env.RAZORPAY_SECRET_ENACH;
                if ((loan.Organization && loan.Organization.razorPayKey) && (loan.Organization && loan.Organization.razorPaySecretKey)) {
                    if (loan.Organization.id != 1) {
                        razorPayEnachKey = decryptText(loan.Organization.razorPayKey);
                        razorPayEnachSecretKey = decryptText(loan.Organization.razorPaySecretKey);
                    }
                }
                let razorpayClient = new RazorpayClient(razorPayEnachKey, razorPayEnachSecretKey);

                let orderIdResponse = await razorpayClient.fetchOrderPayments(loan.orderId);
                let capturedData = orderIdResponse.items.filter(o => o.status == 'captured');
                if (capturedData.length) {
                    capturedData = capturedData[0];
                    let nachDetails = await razorpayClient.retrieveNachDetails(capturedData.id);
                    if (nachDetails.status == 'captured' && (nachDetails.token.recurring_details.status == 'confirmed' || nachDetails.token.recurring_details.status == 'rejected')) {
                        let existingRazorpayMandateDetails = await db.RazorPayMandateDetails.findOne({
                            where: { paymentId: nachDetails.id }
                        });

                        if (!existingRazorpayMandateDetails) {
                            let secondMandateDetails = await db.RazorPayMandateDetails.update({
                                // loanId: loan.id,
                                loanApplicationId: loan.LoanApplication.id,
                                paymentId: nachDetails.id,
                                orderId: nachDetails.order_id,
                                type: nachDetails.method,
                                status: nachDetails.status,
                                tokenId: nachDetails.token_id,
                                bank: nachDetails.token.bank,
                                beneficiaryName: nachDetails.token.bank_details.beneficiary_name,
                                accountNumber: nachDetails.token.bank_details.account_number,
                                ifsc: nachDetails.token.bank_details.ifsc,
                                accountType: nachDetails.token.bank_details.account_type,
                                ...logCreatedBy(req)
                            }, {
                                where: { orderId: nachDetails.order_id }
                            });
                            loan.orderId = nachDetails.order_id;
                            loan.eNachToken = nachDetails.token_id;
                            await loan.save();
                            await secondMandateDetails.save();
                        }

                        let secondNachDetails = await db.RazorPayMandateDetails.findOne({
                            where: { tokenId: nachDetails.token_id }
                        });
                        return sendSuccessResponse(res, secondNachDetails);
                    }

                    if (!nachDetails) {
                        return sendSuccessResponse(res, mandateDetails, 'No Second Mandate');
                    }
                }

                if (!capturedData) {
                    return sendSuccessResponse(res, mandateDetails, 'No Second Mandate ');
                }
            }

            if (!mandateDetails) {
                if (!loan) {
                    return sendErrorResponse(res, ERROR_MESSAGES.LOAN_NOT_FOUND, 404);
                }

                let oPaymentGateway = await PaymentGateway.build(loan.organizationId, loan.LoanApplication.eMandatePartner);
                let mandateResponse: any = await oPaymentGateway.getMandateDetail(loan.LoanApplication, req);
                if (mandateResponse.status) {
                    if (mandateResponse.data && (mandateResponse.data.digioUmrn || mandateResponse.data.eNachID)) {
                        let mandateDetails = mandateResponse.mendateDetail;
                        await db.RazorPayMandateDetails.create({
                            loanId: loan.id,
                            ...mandateDetails,
                            ...logCreatedBy(req)
                        });
                        return sendSuccessResponse(res, mandateDetails);
                    } else {
                        return sendSuccessResponse(res, {});
                    }
                } else {
                    return sendErrorResponse(res, mandateResponse.message, BAD_REQUEST);
                }
            }
            sendSuccessResponse(res, mandateDetails);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async checkSecondMandateStatus(req: Request, res: Response) {
        try {
            let mandateDetails = await db.RazorPayMandateDetails.findOne({
                where: { loanId: req.params.id }
            });
            let loan = await db.Loan.findOne({
                attributes: ['id', 'orderId'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication
                }, {
                    model: db.Organization
                }]
            });
            if (loan.orderId) {
                let razorPayEnachKey = process.env.RAZORPAY_KEY_ENACH;
                let razorPayEnachSecretKey = process.env.RAZORPAY_SECRET_ENACH;
                if ((loan.Organization && loan.Organization.razorPayKey) && (loan.Organization && loan.Organization.razorPaySecretKey)) {
                    if (loan.Organization.id != 1) {
                        razorPayEnachKey = decryptText(loan.Organization.razorPayKey);
                        razorPayEnachSecretKey = decryptText(loan.Organization.razorPaySecretKey);
                    }
                }
                let razorpayClient = new RazorpayClient(razorPayEnachKey, razorPayEnachSecretKey);

                let orderIdResponse = await razorpayClient.fetchOrderPayments(loan.orderId);

                if (!orderIdResponse.items.length) {
                    return sendErrorResponse(res, "Customer yet to complete");
                }

                let capturedData = orderIdResponse.items.filter(o => o.status == 'captured');

                if (capturedData.length) {
                    capturedData = capturedData[0];
                    let nachDetails = await razorpayClient.retrieveNachDetails(capturedData.id);
                    let secondNachDetails = await db.RazorPayMandateDetails.findOne({
                        where: { tokenId: nachDetails.token_id }
                    });
                    let data = {
                        loanApplicationId: loan.LoanApplication.id,
                        paymentId: nachDetails.id,
                        orderId: nachDetails.order_id,
                        type: nachDetails.method,
                        status: nachDetails.status,
                        recurring_status: nachDetails.token.recurring_details.status,
                        tokenId: nachDetails.token_id,
                        bank: nachDetails.token.bank,
                        beneficiaryName: nachDetails.token.bank_details.beneficiary_name,
                        accountNumber: nachDetails.token.bank_details.account_number,
                        ifsc: nachDetails.token.bank_details.ifsc,
                        accountType: nachDetails.token.bank_details.account_type,
                    };
                    if (nachDetails.status == 'captured' && nachDetails.token.recurring_details.status != 'confirmed') {
                        sendSuccessResponse(res, data, 'Emandate has been Cancelled/Rejected');
                    } else {
                        sendSuccessResponse(res, secondNachDetails);
                    }
                }
            }
            if (!loan.orderId) {
                return sendSuccessResponse(res, mandateDetails, 'Second Mandate not available');
            }
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async getVideoKyc(req: Request, res: Response) {
        try {
            let id = req.params.custId || req['loanId'];

            // Find the loan application by the loan application id
            let customers = await db.Customer.findOne({
                attributes: ['id', 'customerId'],
                where: { id: id },
                include: [db.DigioEkycRequests]
            });

            let videoPath = s3ObjectFixedName('LA', customers.id, `videoKyc`, `video/webm`);

            try {
                videoPath = await getSignedURL(videoPath);
            }
            catch (e) {
                return sendErrorResponse(res, "Invalid_URL", BAD_REQUEST);
            }

            sendSuccessResponseSafe(res, videoPath);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async getTcplVideoKyc(req: Request, res: Response) {
        try {
            let videoPath: any;
            // Find the loan application by the loan application id
            let loanApplication = await db.LoanApplication.findOne({
                attributes: ['id', 'videoPathS3'],
                where: { id: req.params.applicationId }
            });

            try {
                videoPath = await getSignedURL(loanApplication.videoPathS3);
            }

            catch (e) {
                return sendErrorResponse(res, "Invalid_Video_URL", BAD_REQUEST);
            }
            sendSuccessResponseSafe(res, videoPath);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async eSignChange(req: Request, res: Response) {
        try {
            // Fetch the information about the loan
            let loan = await db.Loan.findOne({
                attributes: ['id'],
                where: { id: req.params.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id', 'offlineTermsOfService', 'eSignPartner'],
                }]
            });

            if (!loan) return sendErrorResponse(res, LOAN_NOT_FOUND, NOT_FOUND);

            if (loan.LoanApplication.offlineTermsOfService) return sendErrorResponse(res, 'Offline Terms and Conditions already enabled!');

            if (req.body.eSignPartner == "EMUDRA") {
                loan.LoanApplication.eSignPartner = "EMUDRA"
            } else if (req.body.eSignPartner == "DIGIO") {
                loan.LoanApplication.eSignPartner = "DIGIO"
            } else {
                loan.LoanApplication.offlineTermsOfService = true;
            }
            await loan.LoanApplication.save();

            sendSuccessResponse(res, {}, 'Offline Terms and Conditions enabled has been successfully');
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    private static async _getAuditList(req: Request) {
        let filter: any = {
            attributes: ['id', 'loanNumber', 'status'],
            where: {
                loanNumber: {
                    [Sequelize.Op.notBetween]: ['003-DUM-0000001', '003-DUM-9999999']
                },
                CreatedAt: {
                    [db.Sequelize.Op.lte]: req.query.date
                }
            },
            order: [['id', 'ASC']]
        };
        filter.include = [
            {
                model: db.CustomerPayments,
                attributes: ['amount', 'loanId', 'paymentMode', 'rpPaymentId', 'createdAt'],
                where: {
                    paymentType: { [db.Sequelize.Op.eq]: EMI }
                }
            },
            {
                model: db.LoanEmi,
                required: false,
            }];
        return await db.Loan.findAll({ ...filter });
    }

    static async posExportToExcel(req: Request, res: Response) {
        try {

            // Fetch the loan using the private common method
            let excelSheet = new Excel,
                result = await Controller._getAuditList(req);

            const getLastTransactionDate = loan => {
                return loan.CustomerPayments[loan.CustomerPayments.length - 1].createdAt;
            }

            const isStatusClosedOrCancelled = status => {
                return ["CLOSED", "CANCELLED"].indexOf(status.toUpperCase()) >= 0;
            }

            const getTotalAmountPaid = loan => {
                if (isStatusClosedOrCancelled(loan.status)) {
                    return Promise.resolve(loan.LoanEmis.reduce((totalEmiAmountPaid, emi) => {
                        return {
                            successfulPayment: totalEmiAmountPaid.successfulPayment + emi.emiAmount,
                            tentativePayment: 0
                        };
                    }, {
                        successfulPayment: 0,
                        tentativePayment: 0
                    }));
                }
                const validPayments = loan.CustomerPayments.filter(payment => {
                    return new Date(payment.createdAt).getTime() <= new Date(req.query.date).getTime();
                });
                if (validPayments.length == 0) {
                    return Promise.resolve({
                        successfulPayment: 0,
                        tentativePayment: 0
                    });
                }
                let listOfPromises = [];
                validPayments.forEach(transaction => {
                    if (!transaction.rpPaymentId || (transaction.paymentMode != 1)) {
                        listOfPromises.push(Promise.resolve({
                            successfulPayment: transaction.amount,
                            tentativePayment: 0
                        }));
                    } else {
                        listOfPromises.push(db.PaymentEventInformations.findAll({
                            where: {
                                paymentId: { [db.Sequelize.Op.eq]: transaction.rpPaymentId }
                            }
                        }).then(paymentInfo => {
                            if (!paymentInfo) {
                                return Promise.resolve({
                                    successfulPayment: 0,
                                    tentativePayment: transaction.amount
                                });
                            }
                            let isPaymentCaptured = false;
                            paymentInfo.map(o => o.toJSON()).map((payment: any) => {
                                if (payment.status == "captured") {
                                    isPaymentCaptured = true;
                                }
                            });
                            if (isPaymentCaptured) {
                                return Promise.resolve({
                                    successfulPayment: transaction.amount,
                                    tentativePayment: 0
                                });
                            }
                            return Promise.resolve({
                                successfulPayment: 0,
                                tentativePayment: 0
                            });
                        }));
                    }
                });
                return Promise.all(listOfPromises).then((res: any) => {
                    return res.reduce((total, pay) => {
                        return {
                            successfulPayment: total.successfulPayment + pay.successfulPayment,
                            tentativePayment: total.tentativePayment + pay.tentativePayment
                        }
                    }, {
                        successfulPayment: 0,
                        tentativePayment: 0
                    })
                });
            }

            const getNumberOfEmiDue = (loan, totalEmiAmountPaid) => {
                if (isStatusClosedOrCancelled(loan.status)) {
                    return 0;
                }
                let totalAmountPaid = totalEmiAmountPaid.successfulPayment + totalEmiAmountPaid.tentativePayment;
                return loan.LoanEmis.filter(emi => {
                    return emi.status == "Paid" && (new Date(emi.dueDate).getTime() <= new Date(req.query.date).getTime())
                }).reduce((numberOfEmiDue, emi) => {
                    if (totalAmountPaid >= emi.emiAmount) {
                        --numberOfEmiDue;
                        totalAmountPaid -= emi.emiAmount;
                    }
                    return numberOfEmiDue;
                }, loan.LoanEmis.length);
            }

            const getLoanStatus = loan => {
                if (isStatusClosedOrCancelled(loan.status)) {
                    if (getLastTransactionDate(loan) && (new Date(getLastTransactionDate(loan)).getTime() <= new Date(req.query.date).getTime())) {
                        return loan.status;
                    } else {
                        return "active";
                    }
                }
                return loan.status;
            }

            const getLastEmiPaymentDate = loan => {
                const listOfEmisAsOnDate = loan.LoanEmis.filter(emi => emi.dueDate <= req.query.date),
                    listOfEmisPaidAsOnDate = listOfEmisAsOnDate.filter(emi => emi.status == "Paid");
                if (listOfEmisAsOnDate.length == listOfEmisPaidAsOnDate.length) {
                    return getLastTransactionDate(loan);
                }
                return listOfEmisPaidAsOnDate[listOfEmisPaidAsOnDate.length - 1].dueDate;
            }

            // Prepare the excel headers.
            let columns: Array<Column> = [
                { header: 'Loan ID', key: 'id' },
                { header: 'Loan Number', key: 'loanNumber' },
                { header: 'No of EMI Due', key: 'numberOfEmiDue' },
                { header: 'No of EMI Paid', key: 'numberOfEmiPaid' },
                { header: 'EMI Amount Due', key: 'emiAmountDue' },
                { header: 'EMI Amount Paid', key: 'emiAmountPaid' },
                { header: 'Status', key: 'status' },
                { header: 'Last EMI Payment Date', key: 'lastEmiPaymentDate' }
            ];

            let promises = [];
            const loans = result.map(o => o.toJSON());
            loans.forEach(loan => {
                if (loan.LoanEmis && loan.LoanEmis.length > 0) {
                    loan.status = getLoanStatus(loan);
                    promises.push(getTotalAmountPaid(loan).then(totalEmiAmountPaid => {
                        const numberOfEmiDue = getNumberOfEmiDue(loan, totalEmiAmountPaid);
                        const numberOfEmiPaid = loan.LoanEmis.length - numberOfEmiDue,
                            lastEmiPaymentDate = getLastEmiPaymentDate(loan);
                        return {
                            id: `${loan.id}${totalEmiAmountPaid.tentativePayment ? '*' : ''}`,
                            loanNumber: loan.loanNumber,
                            numberOfEmiDue,
                            numberOfEmiPaid,
                            emiAmountDue: loan.LoanEmis[0].emiAmount * numberOfEmiDue,
                            emiAmountPaid: loan.LoanEmis[0].emiAmount * numberOfEmiPaid,
                            status: loan.status,
                            lastEmiPaymentDate: lastEmiPaymentDate ? moment(lastEmiPaymentDate).format('DD-MM-YYYY') : ''
                        }
                    }));
                }
            });

            const rows = await Promise.all(promises);

            // Create an excel instance and send the file to the client.
            excelSheet.setCreator(APP_NAME)
                .addSheet(columns, rows, 'POS')
                .writeToDownloadStream(res, 'POS');
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    /**
     * Retrieves the loan emis
     * @param req
     * @param res
     */
    static async getLoanEmis(req: Request, res: Response) {
        try {
            const filter: any = {
                include: [{
                    model: db.LoanEmi
                }],
                where: {
                    loanId: req.params.id
                },
                order: [['id', 'DESC']]
            };
            const loanEmis = await db.LoanEmi.findAll(filter);
            sendSuccessResponse(res, loanEmis);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async getTermsOfServiceSignedURL(req: Request, res: Response) {
        try {
            let loan = await db.Loan.findOne({ where: { id: req.params.id } }), url;
            if (!loan) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_NOT_FOUND, NOT_FOUND);
            }
            try {
                url = await getSignedURL(`TnC/${loan.loanNumber}.pdf`);
            }
            catch (e) {
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_TANDC_LETTER_URL_INVALID, BAD_REQUEST);
            }
            return sendSuccessResponse(res, { signed: url });
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    private static async _getEnachDueList(emiDate) {
        let loans = await db.Loan.findAll({
            where: {
                status: {
                    [db.Sequelize.Op.notIn]: ['closed', 'cancelled']
                }
            },
            attributes: ['loanNumber', 'eNachToken', 'id', 'loanApplicationId', 'consumer', 'digioUmrn', 'disbursedAt'],
            include: [{
                model: db.LoanEmi,
                where: {
                    status: {
                        [db.Sequelize.Op.in]: ['Not Paid', 'Partially Paid']
                    },
                    $and: db.sequelize.where(db.sequelize.fn('date', db.sequelize.col('LoanEmis.dueDate')), '=', emiDate)
                },
                attributes: ['id', 'emiAmount', 'deltaEmiAmount', 'status']
            }, {
                model: db.Organization,
                attributes: ['name', 'id'],
                required: false
            }, {
                model: db.Customer,
                attributes: ['id', 'customerId', 'razorPayCustomerId'],
                required: false
            }, {
                model: db.LoanApplication,
                attributes: ['eMandatePartner'],
            }]
        });
        return loans;
    }

    /**
     * Enach Due List Exports to excel
     * @param req
     * @param res
     */
    static async exportEnachDueListToExcel(req: Request, res: Response) {
        try {
            // Fetch the loan using the private common method
            let excelSheet = new Excel,
                result = await Controller._getEnachDueList(req.query.emiDate);

            // Prepare the excel headers.
            let columns: Array<Column> = [
                { header: 'Organization', key: 'organization', width: 15 },
                { header: 'Loan Number', key: 'loanNumber', width: 15 },
                { header: 'Customer ID', key: 'customerId', width: 15 },
                { header: 'eNACH Token', key: 'eNachToken', width: 15 },
                { header: 'RazorPay CustomerId', key: 'razorPayCustomerId', width: 25 },
                { header: 'eMandate Partner', key: 'eMandatePartner', width: 15 },
                { header: 'EMI Amount', key: 'emiAmount', width: 15 },
                { header: 'Delta Emi Amount', key: 'deltaEmiAmount', width: 25 },
                { header: 'Status', key: 'status', width: 20 },
                { header: 'Loan ID', key: 'loanId', width: 25 },
                { header: 'Loan Application Id', key: 'loanApplicationId', width: 10 },
                { header: 'Consumer Id', key: 'consumer', width: 30 },
                { header: 'Date Of Disbursment', key: 'disbursedAt', width: 30 }
            ];

            //console.log('response of _getEnachDueList: ' + JSON.stringify(result));

            // Format the rows a little bit to fit into the excel
            let rows = result.map((o: any) => {
                return {
                    loanNumber: o.loanNumber,
                    organization: o.Organization.name,
                    customerId: o.Customer.customerId,
                    eNachToken: o.eNachToken ? o.eNachToken.trim() : o.digioUmrn ? o.digioUmrn.trim() : "",
                    eMandatePartner: o.eMandatePartner,
                    emiAmount: o.LoanEmis[0].emiAmount,
                    deltaEmiAmount: o.LoanEmis[0].deltaEmiAmount,
                    status: o.LoanEmis[0].status,
                    loanId: o.id,
                    loanApplicationId: o.loanApplicationId,
                    consumer: o.consumer,
                    razorPayCustomerId: o.Customer.razorPayCustomerId,
                    disbursedAt: moment(o.disbursedAt).format("YYYY-MM-DD")
                }
            });

            // Create an excel instance and send the file to the client.
            excelSheet.setCreator(APP_NAME)
                .addSheet(columns, rows, 'eNACH EMI Presentation List')
                .writeToDownloadStream(res, 'eNACH EMI Presentation List');
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    static async adjustPayment(req: Request, res: Response) {
        try {
            let adjustOutstanding = req.body.adjustOutstanding || false;
            let paymentId = req.params.paymentid;
            let cPayments = await db.CustomerPayments.findAll({
                attributes: ["id", "loanId", "amount"],
                where: { "id": { [db.Sequelize.Op.in]: [paymentId] }, "amount": { [db.Sequelize.Op.gt]: 0 }, "isTest": 0 },
            });

            if (!cPayments || !cPayments.length) {
                return sendErrorResponse(res, 'Payment data not found.');
            }

            let adjustAmount = 0;
            if (isDefined(req.body.adjustAmount, true)) {
                adjustAmount = req.body.adjustAmount || 0;
            }
            let loanIdMaps = {};
            cPayments.map(async (o) => {
                if (!isNaN(o.amount * 1)) {
                    if (!loanIdMaps[o.loanId]) {
                        loanIdMaps[o.loanId] = 0;
                    }
                    loanIdMaps[o.loanId] += adjustAmount != 0 ? adjustAmount : (o.amount * 1);
                    if (adjustAmount != 0) {
                        o.amount = o.amount - adjustAmount;
                    } else {
                        o.amount = 0;
                    }
                    o.updatedAt = new Date();
                    await o.save();
                }
            });

            if (!adjustOutstanding) {
                return sendSuccessResponse(res, {}, 'Payment data processed successfully!');
            }

            let loanIds = Object.keys(loanIdMaps);

            if (!loanIds.length) {
                return sendErrorResponse(res, 'Loan data not found!');
            }

            let loans = await db.Loan.findAll({
                attributes: ['id', 'principalOutstanding'],
                where: { id: { [db.Sequelize.Op.in]: loanIds } },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Customer,
                        attributes: ['id', 'principalOutstanding']
                    }, {
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }]
            });

            for await (let loan of loans) {
                console.log("loanId :", loan.id, " principalOutstanding :", loan.principalOutstanding, " amount To Adjust: ", loanIdMaps[loan.id]);
            }

            let oTransactionHandler = new TransactionHandler();
            try {
                for await (let loan of loans) {
                    let loanId = loan.id;
                    if (!isNaN(loanIdMaps[loanId])) {
                        await oTransactionHandler.getTransaction();
                        await Promise.all([
                            loan,
                            loan.LoanApplication.Customer,
                            loan.LoanApplication.Branch,
                            loan.LoanApplication.Branch.Partner,
                            loan.LoanApplication.Branch.Partner.Service,
                            loan.LoanApplication.Branch.Partner.Service.Sector,
                        ].map((model: any) => {
                            //console.log(model.principalOutstanding);
                            model.principalOutstanding += loanIdMaps[loanId];
                            //console.log(model.principalOutstanding);
                            return model.save({ transaction: oTransactionHandler.transaction });
                        }));
                        await oTransactionHandler.commit();
                    }
                }
            } catch (e) {
                await oTransactionHandler.rollback();
                return internalServerError(res, e);
            }

            sendSuccessResponse(res, {}, 'Payment and Loan outstanding data processed successfully!');
        }
        catch (e) {
            internalServerError(res, e);
        }
    }

    static async addBounceCharge(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {
            await oTransactionHandler.getTransaction();

            let adjustOutstanding = req.body.adjustOutstanding || false;
            let emiId = req.params.emiId;
            let emiData = await db.LoanEmi.findOne({
                attributes: ["id", "bounceChargesOverridden", "bounceCharges", "totalAmount", "penaltyAmountOverridden", "emiAmount", "bounceChargeDelta"],
                where: { "id": emiId },
                include: [{
                    model: db.Loan,
                    attributes: ["id", "totalBounceCharges", "principalOutstanding"]
                }]
            }, { transaction: oTransactionHandler.transaction });

            if (!emiData) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, 'Emi data not found.');
            }

            if (emiData.bounceChargesOverridden > 0 && emiData.bounceChargeDelta != 0) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, 'Bounce charges already applied on Emi selected EMI.');
            }

            let adjustAmount = 0;
            if (isDefined(req.body.bounceChargesAmount, true)) {
                adjustAmount = req.body.bounceChargesAmount || 0;
            }

            // Adjust EMI
            emiData.bounceChargesOverridden = adjustAmount;
            emiData.bounceChargeDelta = adjustAmount;
            emiData.bounceCharges = adjustAmount;
            emiData.totalAmount = emiData.totalAmount + emiData.bounceChargesOverridden;

            if (adjustOutstanding) {
                emiData.bounceChargeAmountPaid = emiData.bounceChargesOverridden;
                emiData.paidAmount = emiData.paidAmount + emiData.bounceChargesOverridden;
            }

            // Adjust Loan
            emiData.Loan.totalBounceCharges = emiData.Loan.totalBounceCharges + adjustAmount;

            let promissList = [];
            promissList.push(emiData);
            promissList.push(emiData.Loan);
            try {
                await Promise.all(promissList.map((model: any) => {
                    return model.save({ transaction: oTransactionHandler.transaction });
                }));
                await oTransactionHandler.commit();
            } catch (e) {
                await oTransactionHandler.rollback();
                return internalServerError(res, e);
            }

            if (!adjustOutstanding) {
                try {
                    return sendSuccessResponse(res, {}, 'Bounce charges added successfully!');
                } catch (e) {
                    return internalServerError(res, e);
                }
            }

            await oTransactionHandler.getTransaction();;
            let loan = await db.Loan.findOne({
                attributes: ['id', 'principalOutstanding'],
                where: { id: emiData.Loan.id },
                include: [{
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Customer,
                        attributes: ['id', 'principalOutstanding']
                    }, {
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }]
            });

            try {
                await Promise.all([
                    loan,
                    loan.LoanApplication.Customer,
                    loan.LoanApplication.Branch,
                    loan.LoanApplication.Branch.Partner,
                    loan.LoanApplication.Branch.Partner.Service,
                    loan.LoanApplication.Branch.Partner.Service.Sector,
                ].map((model: any) => {
                    model.principalOutstanding += adjustAmount;
                    return model.save({ transaction: oTransactionHandler.transaction });
                }));
                await oTransactionHandler.commit();
            } catch (e) {
                await oTransactionHandler.rollback();
                return internalServerError(res, e);
            }

            sendSuccessResponse(res, {}, 'Bounce charges added and Loan outstanding updated successfully!');
        }
        catch (e) {
            await oTransactionHandler.rollback();
            internalServerError(res, e);
        }
    }

    static async adjustEmiCharge(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {
            await oTransactionHandler.getTransaction();;

            let adjustOutstanding = req.body.adjustOutstanding || false;
            let emiId = req.params.emiId;
            let emiData = await db.LoanEmi.findOne({
                where: { "id": emiId },
                include: [{
                    model: db.Loan,
                    attributes: ["id", "totalBounceCharges", "principalOutstanding", "pendingRecovery"]
                }]
            }, { transaction: oTransactionHandler.transaction });

            if (!emiData) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, 'Emi data not found.');
            }

            let adjustAmount = 0;
            if (isDefined(req.body.adjustAmount, true)) {
                adjustAmount = req.body.adjustAmount || 0;
            }


            if (req.body.type == 'AB') {
                if (emiData.bounceChargesOverridden == 0) {
                    // Adjust EMI
                    emiData.bounceChargesOverridden = adjustAmount;
                    emiData.bounceCharges = adjustAmount;
                    emiData.totalAmount = emiData.totalAmount + adjustAmount;

                    // Adjust Loan
                    emiData.Loan.totalBounceCharges = emiData.Loan.totalBounceCharges + adjustAmount;
                } else {
                    await oTransactionHandler.rollback();
                    return sendErrorResponse(res, 'Emi already has bounce charges.');
                }
            } else if (req.body.type == 'PB') {
                if (emiData.bounceChargesOverridden == 0) {
                    // Adjust EMI
                    emiData.bounceChargesOverridden = adjustAmount;
                    emiData.bounceCharges = adjustAmount;
                    emiData.totalAmount = emiData.totalAmount + adjustAmount;

                    // Adjust Loan
                    emiData.Loan.totalBounceCharges = emiData.Loan.totalBounceCharges + adjustAmount;
                } else {
                    if (emiData.bounceChargesOverridden < adjustAmount) {
                        await oTransactionHandler.rollback();
                        return sendErrorResponse(res, 'Adjustment amount is more than bounce charges.');
                    }
                }

                adjustAmount = adjustAmount - emiData.bounceChargeAmountPaid;
                emiData.bounceChargeAmountPaid = emiData.bounceChargeAmountPaid + adjustAmount;

                emiData.bounceChargeDelta = emiData.bounceChargesOverridden - emiData.bounceChargeAmountPaid;
                if (emiData.bounceChargeDelta == emiData.bounceChargesOverridden)
                    emiData.bounceChargeDelta = null;
                emiData.paidAmount = emiData.paidAmount + adjustAmount;

            } else if (req.body.type == 'RB') {
                if (emiData.bounceChargesOverridden == 0) {
                    await oTransactionHandler.rollback();
                    return sendErrorResponse(res, 'No bounce charges to reverse.');
                } else {
                    // Adjust EMI
                    if (emiData.bounceChargeAmountPaid) {
                        if (emiData.bounceChargeAmountPaid < adjustAmount) {
                            await oTransactionHandler.rollback();
                            return sendErrorResponse(res, 'Cant adjust bounce paid charges as adjustment amount is more than paid bounce charges.');
                        }

                        adjustAmount = adjustAmount - emiData.bounceChargeAmountPaid;
                        emiData.bounceChargeAmountPaid = emiData.bounceChargeAmountPaid + adjustAmount;

                        emiData.bounceChargeDelta = emiData.bounceChargesOverridden - emiData.bounceChargeAmountPaid;
                        if (emiData.bounceChargeDelta == emiData.bounceChargesOverridden)
                            emiData.bounceChargeDelta = null;
                        emiData.paidAmount = emiData.paidAmount + adjustAmount;

                    } else {
                        if (emiData.bounceChargesOverridden < adjustAmount) {
                            await oTransactionHandler.rollback();
                            return sendErrorResponse(res, 'Cant adjust bounce overridden charges as adjustment amount is more than bounce overridden charges.');
                        }

                        adjustAmount = (emiData.bounceChargesOverridden - adjustAmount);
                        emiData.bounceChargesOverridden = emiData.bounceChargesOverridden - adjustAmount;
                        emiData.bounceChargeDelta = 0;

                        emiData.bounceWaived = false;
                        if (emiData.bounceChargesOverridden != emiData.bounceCharges) {
                            emiData.bounceWaived = true;
                        }
                        emiData.totalAmount = emiData.totalAmount - adjustAmount;
                        if (emiData.bounceChargesOverridden == 0) {
                            emiData.bounceCharges = 0;
                        }
                    }
                }
            } else if (req.body.type == 'EMI') {
                let diff = (emiData.deltaAmount || emiData.emiAmount) - adjustAmount;
                let paidAmt = emiData.paidAmount - emiData.bounceChargeAmountPaid - emiData.penaltyAmountPaid;

                paidAmt = diff - paidAmt;
                emiData.paidAmount += paidAmt;
                paidAmt = paidAmt * -1;

                if (emiData.paidAmount < 0) {
                    await oTransactionHandler.rollback();
                    return sendErrorResponse(res, 'EMI adjustment amount must be less than paid or equal to paid amount!');
                }

                emiData.deltaEmiAmount = adjustAmount;
                if (emiData.paidAmount == 0) {
                    emiData.deltaEmiAmount = null;
                    emiData.status = "Not Due";
                } else if (emiData.deltaEmiAmount > 0) {
                    emiData.status = "Partial Paid";
                } else {
                    emiData.status = "Paid";
                }
                adjustAmount = paidAmt;

                if (!isNaN(emiData.Loan.pendingRecovery))
                    emiData.Loan.pendingRecovery += adjustAmount;
            }

            let promissList = [];
            promissList.push(emiData);
            promissList.push(emiData.Loan);
            try {
                await Promise.all(promissList.map((model: any) => {
                    return model.save({ transaction: oTransactionHandler.transaction });
                }));
                await oTransactionHandler.commit();
            } catch (e) {
                await oTransactionHandler.rollback();
                return internalServerError(res, e);
            }

            if (!adjustOutstanding && req.body.type != 'EMI') {
                return sendSuccessResponse(res, {}, 'Bounce charges added successfully!');
            }

            //sendSuccessResponse(res, {}, 'EMI adjustment updated successfully!');
            if (adjustAmount && adjustOutstanding) {
                await oTransactionHandler.getTransaction();
                let loan = await db.Loan.findOne({
                    attributes: ['id', 'principalOutstanding'],
                    where: { id: emiData.Loan.id },
                    include: [{
                        model: db.LoanApplication,
                        attributes: ['id'],
                        include: [{
                            model: db.Customer,
                            attributes: ['id', 'principalOutstanding']
                        }, {
                            model: db.Branch,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Partner,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Service,
                                    attributes: ['id', 'principalOutstanding'],
                                    include: [{
                                        model: db.Sector,
                                        attributes: ['id', 'principalOutstanding']
                                    }]
                                }]
                            }]
                        }]
                    }]
                }, { transaction: oTransactionHandler.transaction });

                try {
                    await Promise.all([
                        loan,
                        loan.LoanApplication.Customer,
                        loan.LoanApplication.Branch,
                        loan.LoanApplication.Branch.Partner,
                        loan.LoanApplication.Branch.Partner.Service,
                        loan.LoanApplication.Branch.Partner.Service.Sector,
                    ].map((model: any) => {
                        model.principalOutstanding += adjustAmount;
                        return model.save({ transaction: oTransactionHandler.transaction });
                    }));
                    await oTransactionHandler.commit();
                } catch (e) {
                    await oTransactionHandler.rollback();
                    return internalServerError(res, e);
                }
            }

            return sendSuccessResponse(res, {}, 'EMI adjustment updated successfully!');
        }
        catch (e) {
            console.log(e);
            await oTransactionHandler.rollback();
            return internalServerError(res, e);
        }
    }

    static async createPaymentEventByCustPayment(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {

            let custPaymentId = req.params.custPaymentId;
            let custPayment = await db.CustomerPayments.findOne({
                where: { "id": custPaymentId },
                attributes: ["id", "paidAt", "loanApplicationId", "loanId", "rpPaymentId"]
            });

            if (!custPayment) {
                return sendErrorResponse(res, 'Customer payment data not found.');
            }

            if (!custPayment.rpPaymentId) {
                return sendErrorResponse(res, 'Payment Id not found.');
            }

            let paymentEventInfo = await db.PaymentEventInformations.findOne({
                where: { "paymentId": custPayment.rpPaymentId.trim() },
                attributes: ["id"]
            });

            if (paymentEventInfo) {
                return sendErrorResponse(res, 'Payment informatation already exist.');
            }

            await db.PaymentEventInformations.create({
                paymentId: custPayment.rpPaymentId,
                eventType: "",
                status: "",
                errorCode: "",
                errorDescription: "",
                razorpayEventId: "NA",
                loanApplicationId: custPayment.loanApplicationId || null,
                loanId: custPayment.loanId || null,
                paymentType: custPayment.paymentType,
                paymentMode: "",
                isRecordProcessed: 0,
                ...logCreatedBy(req)
            });

            return sendSuccessResponse(res, {}, 'Payment Event created successfully!');
        } catch (e) {
            return internalServerError(res, e);
        }
    }

    static async capturePaymentEventStatus(req: Request, res: Response) {
        let oTransactionHandler = new TransactionHandler();
        try {
            oTransactionHandler.getTransaction();
            //await  oTransactionHandler.getTransaction();;

            let paymentEventId = req.params.paymentEventId;
            let paymentEventInfo = await db.PaymentEventInformations.findOne({
                where: { "id": paymentEventId }
            }, { transaction: oTransactionHandler.transaction });

            if (!paymentEventInfo) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, 'Payment informatation not found.');
            }

            let custPaymentDetail = await db.CustomerPayments.findOne({
                where: { "rpPaymentId": paymentEventInfo.paymentId }
            }, { transaction: oTransactionHandler.transaction });

            if (!custPaymentDetail) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, 'Customer payment data not found.');
            }
            if (!custPaymentDetail.rpOrderId && !custPaymentDetail.rpPaymentId) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, 'Payment Id or Order id not found.');
            }

            let loanEmi = await db.LoanEmi.findOne({
                where: { "paymentId": custPaymentDetail.id }
            }, { transaction: oTransactionHandler.transaction });

            // Fetch the loan application
            let loan = await db.Loan.findOne({
                attributes: ['id', 'principalOutstanding'],
                where: { id: paymentEventInfo.loanId },
            }, { transaction: oTransactionHandler.transaction });

            let loanApplication = db.LoanApplication.findOne({
                where: { id: paymentEventInfo.loanApplicationId },
                attributes: ['id'],
                include: [{
                    model: db.Customer,
                    attributes: ['id', 'principalOutstanding']
                }, {
                    model: db.Organization
                }, {
                    model: db.Branch,
                    attributes: ['id', 'principalOutstanding'],
                    include: [{
                        model: db.Partner,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Service,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Sector,
                                attributes: ['id', 'principalOutstanding']
                            }]
                        }]
                    }]
                }]
            }, { transaction: oTransactionHandler.transaction });

            if (!loanApplication) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_NOT_FOUND, BAD_REQUEST);
            }

            let razorPayKey = process.env.RAZORPAY_KEY;
            let razorPaySecretKey = process.env.RAZORPAY_SECRET;
            if ((loanApplication.Organization && loanApplication.Organization.razorPayKey) && (loanApplication.Organization && loanApplication.Organization.razorPaySecretKey)) {
                razorPayKey = decryptText(loanApplication.Organization.razorPayKey);
                razorPaySecretKey = decryptText(loanApplication.Organization.razorPaySecretKey);
            }

            let razorpayClient = new RazorpayClient(razorPayKey, razorPaySecretKey);
            let captured = null;
            let item = null;

            if (custPaymentDetail.rpOrderId) {
                captured = await razorpayClient.fetchOrderPayments(custPaymentDetail.rpOrderId);
                if (captured && captured.count) {
                    captured.items.reduce((a, o) => {
                        if (o.id == paymentEventInfo.paymentId) {
                            item = o;
                        };
                    }, null);
                }
            } else if (custPaymentDetail.rpOrderId) {
                captured = await razorpayClient.getPaymentStatus(custPaymentDetail.rpPaymentId);
                item = captured;
            }


            if (!item) {
                await oTransactionHandler.rollback();
                return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_PAYMENT_NOT_CAPTURED, BAD_REQUEST);
            }

            if (item.captured && loanEmi) {
                custPaymentDetail.paidAt = moment(new Date(item.created_at * 1000)).format("YYYY-MM-DD H:m:s");
                await custPaymentDetail.save();
                if (loanEmi.status == "Not Due") {
                    loanEmi.status = "Paid";
                    loanEmi.paidAmount = custPaymentDetail.amount;
                    loanEmi.deltaAmount = 0;
                    loanEmi.penaltyDelta = 0;
                    loanEmi.bounceChargeDelta = 0;
                    loanEmi.deltaEmiAmount = 0;
                    await loanEmi.save({ transaction: oTransactionHandler.transaction });

                    try {
                        await Promise.all([
                            loan,
                            loanApplication.Customer,
                            loanApplication.Branch,
                            loanApplication.Branch.Partner,
                            loanApplication.Branch.Partner.Service,
                            loanApplication.Branch.Partner.Service.Sector
                        ].map((model: any) => {
                            model.principalOutstanding -= loanEmi.principal;
                            return model.save({ transaction: oTransactionHandler.transaction });
                        }));

                    } catch (e) {
                        await oTransactionHandler.rollback();
                        return internalServerError(res, e);
                    }
                }
            }

            paymentEventInfo.isRecordProcessed = 1;
            paymentEventInfo.status = item.status;
            paymentEventInfo.errorCode = item.error_code;
            paymentEventInfo.errorDescription = item.error_description;
            await paymentEventInfo.save({ transaction: oTransactionHandler.transaction });

            await oTransactionHandler.commit();
            return sendSuccessResponse(res, {}, 'Payment Event created successfully!');
        } catch (e) {
            await oTransactionHandler.rollback();
            return internalServerError(res, e);
        }
    }

    static async bulkCloserUpdate(req: Request, res: Response) {
        const bulkLoans = req.body.reduce((acc, bulkCloser) => {
            acc[bulkCloser[0]] = {
                loanId: bulkCloser[0] || "",
                remark: bulkCloser[1] || "System Closer",
            };
            return acc;
        }, {});

        let loans = await db.Loan.findAll({
            where: { loanNumber: { [db.Sequelize.Op.in]: Object.keys(bulkLoans) } },
            attributes: ['id', 'status']
        })

        for await (let loan of loans) {
            if (loans.status == 'closed') {
                return sendErrorResponse(res, loan.loanId + " " + 'loan Id already closed, Remove it and reupload.');
            }
        }

        const isSuccess = await Controller.bulkCloser(req, res, bulkLoans, true);

        if (isSuccess) {
            return sendSuccessResponse(res, {}, 'Loans Closed Successfully');
        }
        return sendErrorResponse(res, `Failed to close loans`, BAD_REQUEST);
    }

    public static async autoCloseLoans(req: Request, res: Response) {
        let loans = await db.Loan.findAll({
            where: {
                principalOutstanding: { [db.Sequelize.Op.between]: [-100, 100] },
                status: "active"
            },
            attributes: ['id', 'loanNumber']
        });

        let bulkLoans = loans.reduce((a, o) => {
            a[o.id] = { loanId: o.id, remark: "System Auto Closer" };
            return a;
        }, {});

        const isSuccess = await Controller.bulkCloser(req, res, bulkLoans, true);

        if (isSuccess) {
            return sendSuccessResponse(res, {}, 'Loans Closed Successfully');
        }
        return sendErrorResponse(res, `Failed to close loans`, BAD_REQUEST);
    }

    private static async bulkCloser(req: Request, res: Response, LoanId: any, setPnL = false) {
        let oTransactionHandler = new TransactionHandler();

        try {
            let loans = await db.Loan.findAll({
                where: { loanNumber: { [db.Sequelize.Op.in]: Object.keys(LoanId) } },
                include: [{
                    model: db.LoanEmi
                }, {
                    model: db.LoanApplication,
                    attributes: ['id'],
                    include: [{
                        model: db.Branch,
                        attributes: ['id', 'principalOutstanding'],
                        include: [{
                            model: db.Partner,
                            attributes: ['id', 'principalOutstanding'],
                            include: [{
                                model: db.Service,
                                attributes: ['id', 'principalOutstanding'],
                                include: [{
                                    model: db.Sector,
                                    attributes: ['id', 'principalOutstanding']
                                }]
                            }]
                        }]
                    }]
                }, {
                    model: db.Customer,
                    attributes: ['id', 'principalOutstanding']
                }]
            });

            await oTransactionHandler.getTransaction();
            for await (let loan of loans) {

                let newData = LoanId[loan.id];

                loan.subStatus = null;
                loan.status = "closed";
                loan.closedAt = new Date();
                loan.closeCancelRemarks = newData.remark || "System Closer";

                const calculatePrincipal = (emi: number, delta: number, interest: number) => {
                    let amount = emi - delta - interest;
                    return amount < 0 ? 0 : amount
                }

                let principalPaid = loan.LoanEmis.reduce((paid: number, emi: any) => {
                    if (emi.status == "Paid") {
                        return paid;
                    }

                    const partiallyPaid = emi.status === "Partially Paid";
                    let emiAmount = partiallyPaid && emi.deltaEmiAmount ? emi.deltaEmiAmount : emi.emiAmount;

                    emi.deltaEmiAmount = 0;

                    const previousPrincipal = calculatePrincipal(emi.emiAmount, emiAmount, emi.interest);
                    const currentPrincipal = calculatePrincipal(emi.emiAmount, emi.deltaEmiAmount, emi.interest);
                    paid += currentPrincipal - previousPrincipal;
                    return paid;
                }, 0);

                await Promise.all([
                    db.CloseLoanState.create({
                        loanId: loan.id,
                        user: req.user.id,
                        closureType: "CLOSE",
                        ...logCreatedBy(req)
                    }, { transaction: oTransactionHandler.transaction }),
                    //db.CloseLoanState.destroy({ where: { loanId: loan.id }, transaction }),
                    db.CustomerPayments.create({
                        customer: loan.consumer,
                        amount: loan.principalOutstanding,
                        paymentType: CUSTOMER_PAYMENT_EMI,
                        paymentMode: PRE_CLOSURE,
                        rpPaymentId: "Nominal Adjustment",
                        paidAt: new Date(),
                        loanApplicationId: loan.loanApplicationId,
                        loanId: loan.id,
                        ...logCreatedBy(req)
                    }, { transaction: oTransactionHandler.transaction }),
                    db.LoanEmi.update({ status: 'Paid', deltaEmiAmount: 0 }, {
                        where: {
                            loanId: loan.id,
                        },
                        transaction: oTransactionHandler.transaction
                    })
                ]);

                loan.pendingRecovery = 0;

                if (loan.principalOutstanding - principalPaid <= 20) {
                    principalPaid += loan.principalOutstanding - principalPaid
                }
                if (setPnL == true) {
                    loan.closerPnL = -1 * (loan.principalOutstanding - principalPaid);
                }
                await Promise.all([
                    loan,
                    loan.Customer,
                    loan.LoanApplication.Branch,
                    loan.LoanApplication.Branch.Partner,
                    loan.LoanApplication.Branch.Partner.Service,
                    loan.LoanApplication.Branch.Partner.Service.Sector,
                ].map((model: any) => {
                    model.principalOutstanding -= principalPaid;
                    return model.save({ transaction: oTransactionHandler.transaction });
                }));
            }
            await oTransactionHandler.commit();
            return true;
        }
        catch (e) {
            await oTransactionHandler.rollback();
            console.error(`Bulk Closer Error: -> `, e);
            return false;
        }
    }


    static async preclosuerStatement(req: Request, res: Response) {
        try {
            let resultList = [];
            let loans = await db.Loan.findAll({
                attributes: ["id", "loanAmount", "loanNumber", "principalOutstanding", "totalBounceCharges", "emiAmount", "createdAt"],
                where: { loanNumber: parseInput("loanNumber", req.body.loanIds) },
                include: [{
                    model: db.Customer,
                    attributes: ['customerId', 'mobile', 'email', 'fullName']
                }, {
                    model: db.LoanApplication,
                    attributes: ['id', 'moratoriumTenure', 'loanTerm', 'interest']
                }, {
                    model: db.LoanEmi,
                    attributes: ["id", "dueDate", 'principal', 'interest', 'status', 'emiAmount', 'paidAmount']
                }],
                order: [["loanAmount"]]
            });
            let items = {};
            loans.map(o => {
                if (!items[o.Customer.customerId]) {
                    items[o.Customer.customerId] = [];
                }
                items[o.Customer.customerId].push(o);
            });

            for (let customerId in items) {
                let item = items[customerId];
                let loanDetail = item.reduce((a, o) => {
                    let loan = o.toJSON();
                    let list = [];
                    let pos = loan.loanAmount;
                    if (loan.LoanEmis && loan.LoanEmis.length) {
                        let amount = loan.loanAmount;
                        let moratoriumTenure = loan.LoanApplication.moratoriumTenure || 0;
                        let startDate: any = moment(new Date(loan.LoanEmis[0].dueDate)).add((moratoriumTenure + 1) * -1, "months");
                        while (moratoriumTenure > 0) {
                            startDate = moment(new Date(startDate)).add(1, "months");
                            let interest = (amount * (loan.LoanApplication.interest / 100)) / 12;
                            amount += interest;
                            moratoriumTenure--;
                            list.push({ "dueDate": startDate, "emiAmount": 0, 'principal': 0, 'interest': interest, "pos": amount });
                        }
                        pos = amount;
                        loan.LoanEmis.map(i => {
                            if (i.paidAmount > 0) {
                                let paidAmount = i.principal > i.paidAmount ? i.paidAmount : i.principal;
                                pos -= paidAmount;
                            }
                            amount -= i.principal;
                            i.pos = amount;
                            list.push(i);
                        });
                        loan.pos = pos;
                        loan.emiList = list;
                        a.push(loan);
                    }
                    return a;
                }, []);

                resultList.push(loanDetail);
            }
            if (!resultList.length) {
                return sendErrorResponse(res, "Loan not found");
            }
            return sendSuccessResponse(res, resultList);
        } catch (e) {
            internalServerError(res, e);
        }
    }

    public static async loanCounts(req: Request, res: Response) {
        try {
            const query = queryBuilder.select()
                .from("Loans", "L")
                .field("count(L.status)", "total")
                .field("status")
                .where("L.status = ?", "active")
                .group("L.status")
                .toString();

            let result = [];
            let activeLoan = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
            result.push(...activeLoan);

            const LAquery = queryBuilder.select()
                .from("LoanApplications", "LA")
                .field("count(LA.applicationStatus)", "total")
                .field("LA.applicationStatus", "status")
                .group("LA.applicationStatus")
                .where("LA.applicationStatus = ?", 11)
                .toString();
            let rejectedApplication = await db.sequelize.query(LAquery, { type: db.sequelize.QueryTypes.SELECT });
            result.push(...rejectedApplication);
            return sendSuccessResponse(res, result);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    public static async extendTokenExpiryDate(req: Request, res: Response) {
        try {
            let loanApplication = await db.LoanApplication.findOne({
                attributes: ['id', 'accessTokenExpiresAt'],
                where: { id: req.params.id }
            });

            if (!loanApplication) return sendErrorResponse(res, ERROR_MESSAGES.LOAN_APPLICATION_NOT_FOUND, BAD_REQUEST);
            loanApplication.accessTokenExpiresAt = moment().add(parseInt(process.env.LOAN_APPLICATION_EXPIRY_IN_DAYS), 'days').format('YYYY-MM-DD HH:mm:ss');
            await loanApplication.save(); // Persist

            sendSuccessResponse(res, {}, "Expiry date extended for the token.");

        } catch (e) {
            internalServerError(res, e)
        }
    }

    public static async loanApplicationCounts(req: Request, res: Response) {
        try {
            let filterByAccess: any = [];
        
            // Apply the date filter.
            if (req.user.role) {
                //  If the requested user is a customer, add consumer = requested customer id
                // It prevents bringing loan applications other than the requested customer owns.
                if (['BRANCH_ADMIN', 'BRANCH_OWNER'].indexOf(req.user.role) !== -1) {
                    filterByAccess = await Controller._getSubBranchList(req.user.branchId);
                    if (!filterByAccess.length) {
                        filterByAccess = [req.user.branchId];
                    } else {
                        filterByAccess.push(req.user.branchId);
                    }
                } else if (req.user.role === 'PARTNER') {
                    if(!req.user.partnerId){
                        return sendSuccessResponse(res, []);
                    }
                    let partner = await Controller._getSubPartnerList(req.user.partnerId);
                    if (!partner.length) {
                        partner = [req.user.partnerId];
                    } else {
                        partner.push(req.user.partnerId);
                    }
                    let branchData = await db.Branch.findAll({
                        attributes: ["id"],
                        where: {
                            partner: { [db.Sequelize.Op.in]: partner }
                        }
                    });
                    filterByAccess = branchData.reduce((a, i) => {
                        a.push(i.id);
                        return a;
                    }, []);
                }
            }

            let oLAquery = queryBuilder.select()
                .from("Loans", "L")
                .field("count(L.status)", "total")
                .field("L.status", "status")
                .field("L.loanStatus", "loanStatus")
                .field("L.docsPending", "docsPending")
                .field("CASE WHEN L.isVerified IS NOT NULL THEN 1 ELSE 0 END", "isVerified")
                .field("LA.termsConditionsAccepted", "termsConditionsAccepted")
                .left_join("LoanApplications", "LA", "LA.id = L.loanApplicationId")
                .group("LA.termsConditionsAccepted")
                .group("L.isVerified")
                .group("L.status")
                .group("L.loanStatus");
            
            if (filterByAccess.length) {
                oLAquery.where("L.branch IN ?", filterByAccess);
            }

            if (isDefined(req.body.startDate, true) && !isDefined(req.body.endDate, true)) {
                oLAquery.where("L.createdAt  >= ?", req.body.startDate);
            } else if (!isDefined(!req.body.startDate, true) && isDefined(req.body.endDate, true)) {
                oLAquery.where("L.createdAt  <= ?", req.body.endDate);
            } else if (isDefined(req.body.startDate, true) && isDefined(req.body.endDate, true)) {
                oLAquery.where("L.createdAt  BETWEEN ? AND ?", req.body.startDate, req.body.endDate);
            } else if (!isDefined(req.body.startDate, true) && !isDefined(req.body.endDate, true)) {
                let startDate = moment(new Date()).format("YYYY-MM") + "-01";
                let endDate = moment(new Date()).format("YYYY-MM-DD") + " 23:59:59";
                oLAquery.where("L.createdAt  BETWEEN ? AND ?", startDate, endDate);
            }         
            
            const query = queryBuilder.select()
                .from(oLAquery, "origin")
                .field("SUM(origin.total)", "total")
                .field("origin.status")
                .field("origin.docsPending")
                .field("origin.loanStatus")
                .field("origin.isVerified")
                .field("origin.termsConditionsAccepted")
                .group("origin.docsPending")
                .group("origin.termsConditionsAccepted")
                .group("origin.isVerified")
                .group("origin.status")
                .group("origin.loanStatus").toString();
    
            let applicationCount = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
            return sendSuccessResponse(res, applicationCount);
        }
        catch (e) {
            internalServerError(res, e)
        }
    }

    public static async _getSubPartnerList(id: any) {
        let filter: any = id;
        let subPartners = await db.Partner.findAll({
            where: { masterPartner: id },
            attributes: ['id']
        });
        if (subPartners.length) {
            filter = [];
            filter.push(id);
            subPartners.map(o => {
                filter.push(o.id);
            });
        }
        return filter;
    }

    public static async _getSubBranchList(id: any) {
        let filter: any = id;
        let subBranches = await db.Branch.findAll({
            where: { masterBranch: id },
            attributes: ['id']
        });
        if (subBranches.length) {
            filter = [];
            filter.push(id);
            subBranches.map(o => {
                filter.push(o.id);
            });
        }
        return filter;
    }
}
