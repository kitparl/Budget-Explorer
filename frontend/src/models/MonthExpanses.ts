import { OtherExpanses } from "./OtherExpanses";

export interface MonthExpanses {
    id: string,
    year: number,
    month: string,
    budget: number,
    investmentAmount: number,
    savingAmount: number,
    totalExpanseThisMonth: number,
    otherExpanse: any,
}