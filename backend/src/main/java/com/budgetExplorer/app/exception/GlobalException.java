package com.budgetExplorer.app.exception;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.NoHandlerFoundException;
import java.time.LocalDateTime;

public class GlobalException {

    @ControllerAdvice // AOP Aspect Oriented Programming
    public class GlobalAdminExceptionHandler {

        //Handler for Month Exception

        @ExceptionHandler(MonthException.class)
        public ResponseEntity<MyErrorBean> ExceptionHandler1(MonthException ae, WebRequest req) {

            MyErrorBean err = new MyErrorBean();
            err.setTimestamp(LocalDateTime.now());
            err.setMessage(ae.getMessage());
            err.setDetails(req.getDescription(false));

            return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
        }

        //Handler for Year Exception

        @ExceptionHandler(YearException.class)
        public ResponseEntity<MyErrorBean> ExceptionHandler2(YearException ae, WebRequest req) {

            MyErrorBean err = new MyErrorBean();
            err.setTimestamp(LocalDateTime.now());
            err.setMessage(ae.getMessage());
            err.setDetails(req.getDescription(false));

            return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
        }

        //Handler for All Time Exception

        @ExceptionHandler(AllTimeException.class)
        public ResponseEntity<MyErrorBean> ExceptionHandler3(AllTimeException ae, WebRequest req) {

            MyErrorBean err = new MyErrorBean();
            err.setTimestamp(LocalDateTime.now());
            err.setMessage(ae.getMessage());
            err.setDetails(req.getDescription(false));

            return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
        }

        // Handler for any other Exception

        @ExceptionHandler(Exception.class)
        public ResponseEntity<MyErrorBean> genericExceptionHandler4(Exception ae, WebRequest req) {

            MyErrorBean err = new MyErrorBean();
            err.setTimestamp(LocalDateTime.now());
            err.setMessage(ae.getMessage());
            err.setDetails(req.getDescription(false));

            return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
        }

        // No Handler Found Exception

        @ExceptionHandler(NoHandlerFoundException.class)
        public ResponseEntity<MyErrorBean> myexpHandler5(NoHandlerFoundException ae, WebRequest req) {

            MyErrorBean err = new MyErrorBean();
            err.setTimestamp(LocalDateTime.now());
            err.setMessage(ae.getMessage());
            err.setDetails(req.getDescription(false));

            return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
        }

        //Handler for Method Argument not valid Exception

        @ExceptionHandler(MethodArgumentNotValidException.class)
        public ResponseEntity<MyErrorBean> myMANVExceptionHandler6(MethodArgumentNotValidException me) {

            MyErrorBean err = new MyErrorBean();
            err.setTimestamp(LocalDateTime.now());
            err.setDetails("Validation Error");
            err.setMessage(me.getBindingResult().getFieldError().getDefaultMessage());

            return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
        }
    }
}
