import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

function prismaMessage(e: Prisma.PrismaClientKnownRequestError) {
  switch (e.code) {
    case 'P2002':
      return { status: HttpStatus.CONFLICT, message: 'Duplicate value' };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Foreign key constraint failed',
      };
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, message: 'Record not found' };
    case 'P2014':
      return { status: HttpStatus.BAD_REQUEST, message: 'Relation violation' };
    default:
      return { status: HttpStatus.BAD_REQUEST, message: 'Database error' };
  }
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    // 1) Prisma Known Errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, message } = prismaMessage(exception);
      return res.status(status).json({
        success: false,
        message,
        error: { code: exception.code },
      });
    }

    // 2) Prisma Validation / Unknown
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Invalid data for database operation',
        error: { code: 'PRISMA_VALIDATION_ERROR' },
      });
    }

    if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Unknown database error',
        error: { code: 'PRISMA_UNKNOWN_ERROR' },
      });
    }

    // 3) HttpException (AppException, ValidationPipe, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return res.status(status).json({ success: false, message: payload });
      }

      const obj = payload as any;

      // AppException already good
      if (obj?.success === false && obj?.message) {
        return res.status(status).json(obj);
      }

      // Nest default -> normalize
      const message = Array.isArray(obj?.message)
        ? obj.message.join(', ')
        : obj?.message || 'Request error';

      return res.status(status).json({
        success: false,
        message,
        error: obj?.error ? { code: obj.error } : undefined,
      });
    }

    // 4) Unknown
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error',
      error: { code: 'INTERNAL_ERROR' },
    });
  }
}
