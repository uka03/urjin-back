import {
  Controller,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { AppException } from '../common/exceptions/app.exception';

const maxUploadBytes = Number(
  process.env.FILE_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024,
);

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  findAll() {
    return this.filesService.findAll();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: maxUploadBytes })],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new AppException(
        'File is required',
        HttpStatus.BAD_REQUEST,
        'FILE_REQUIRED',
      );
    }

    return this.filesService.upload(file);
  }
}
