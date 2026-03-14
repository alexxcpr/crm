import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'InternalServerError';

        if (exception instanceof HttpException) {
            statusCode = exception.getStatus();
            const res = exception.getResponse();

            if (typeof res === 'string') {
                message = res;
            }
            else if (typeof res === 'object' && res !== null) {
                const obj = res as Record<string, any>;
                message = obj.message ?? message;
                error = obj.error ?? error;
            }
        }

        if (!(exception instanceof HttpException)) {
            console.error('Unhandled exception:', exception);
        }

        response.status(statusCode).json({
            success: false,
            statusCode,
            error,
            message,
            timestamp: new Date().toISOString(),
        });
    }
}