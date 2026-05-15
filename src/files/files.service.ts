import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AppException } from '../common/exceptions/app.exception';
import { DownloadFileEntryDto } from './dto/download-files.dto';

const oneDaySeconds = 24 * 60 * 60;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

type UploadMetadata = {
  deviceId?: string;
  deviceName?: string;
  batchId?: string;
};

@Injectable()
export class FilesService {
  private config?: R2Config;
  private client?: S3Client;

  async findAll() {
    const config = this.getConfig();
    const response = await this.getClient(config).send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: 'uploads/',
      }),
    );

    const files = await Promise.all(
      (response.Contents ?? [])
        .filter((object) => object.Key)
        .map(async (object) => {
          const uploadedAt = object.LastModified ?? new Date();
          const expiresAt = new Date(
            uploadedAt.getTime() + oneDaySeconds * 1000,
          );
          const key = object.Key!;
          const metadata = await this.getObjectMetadata(config, key);

          return {
            key,
            fileName:
              metadata.originalname ??
              metadata.originalName ??
              key.split('/').pop() ??
              key,
            url: `${config.publicUrl}/${key}`,
            size: object.Size ?? 0,
            uploadedAt: uploadedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            ttlSeconds: Math.max(
              0,
              Math.floor((expiresAt.getTime() - Date.now()) / 1000),
            ),
            deviceId: metadata.deviceid ?? metadata.deviceId,
            deviceName: metadata.devicename ?? metadata.deviceName,
            batchId: metadata.batchid ?? metadata.batchId,
          };
        }),
    );

    return files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async upload(file: Express.Multer.File, metadata: UploadMetadata = {}) {
    try {
      const config = this.getConfig();
      const key = this.createObjectKey(file.originalname);
      const fileName = this.toUtf8FileName(file.originalname);
      const expiresAt = new Date(Date.now() + oneDaySeconds * 1000);
      console.log('Uploading file to R2 with key:', key);
      console.log('File details:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });

      await this.getClient(config).send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.size,
          CacheControl: `public, max-age=${oneDaySeconds}, immutable, no-transform`,
          Metadata: {
            originalName: fileName,
            expiresAt: expiresAt.toISOString(),
            deviceId: this.cleanMetadataValue(metadata.deviceId),
            deviceName: this.cleanMetadataValue(metadata.deviceName),
            batchId: this.cleanMetadataValue(metadata.batchId),
          },
        }),
      );

      return {
        key,
        fileName,
        url: `${config.publicUrl}/${key}`,
        expiresAt: expiresAt.toISOString(),
        ttlSeconds: oneDaySeconds,
        deviceId: metadata.deviceId,
        deviceName: metadata.deviceName,
        batchId: metadata.batchId,
      };
    } catch (error) {
      console.log('Error uploading file to R2:', error);
      throw new AppException(
        'Failed to upload file',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'FILE_UPLOAD_FAILED',
      );
    }
  }

  async download(key: string) {
    this.assertValidKey(key);

    try {
      const config = this.getConfig();
      const response = await this.getClient(config).send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new AppException(
          'File not found',
          HttpStatus.NOT_FOUND,
          'FILE_NOT_FOUND',
        );
      }

      const bytes = await response.Body.transformToByteArray();
      const buffer = Buffer.from(bytes);
      const fileName =
        response.Metadata?.originalname ??
        response.Metadata?.originalName ??
        this.getFileNameFromKey(key);

      return {
        buffer,
        fileName,
        contentType: response.ContentType ?? 'application/octet-stream',
        contentLength: String(response.ContentLength ?? buffer.length),
        contentDisposition: this.createAttachmentHeader(fileName),
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      console.log('Error downloading file from R2:', error);
      throw new AppException(
        'Failed to download file',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'FILE_DOWNLOAD_FAILED',
      );
    }
  }

  async downloadManyZip(files: DownloadFileEntryDto[]) {
    if (!files.length) {
      throw new AppException(
        'At least one file is required',
        HttpStatus.BAD_REQUEST,
        'FILES_REQUIRED',
      );
    }

    const entries = await Promise.all(
      files.map(async (file) => {
        this.assertValidKey(file.key);
        const downloaded = await this.download(file.key);

        return {
          name: this.createZipEntryName(downloaded.fileName),
          buffer: downloaded.buffer,
        };
      }),
    );

    const zipBuffer = this.createZipBuffer(this.uniquifyZipEntryNames(entries));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return {
      buffer: zipBuffer,
      contentDisposition: this.createAttachmentHeader(
        `uploaded-files-${timestamp}.zip`,
      ),
    };
  }

  async remove(key: string) {
    this.assertValidKey(key);

    const config = this.getConfig();
    await this.getClient(config).send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    return { key };
  }

  private createObjectKey(originalName: string) {
    const extension = extname(originalName).toLowerCase();
    const datePrefix = new Date().toISOString().slice(0, 10);

    return `uploads/${datePrefix}/${randomUUID()}${extension}`;
  }

  private getFileNameFromKey(key: string) {
    return key.split('/').pop() ?? 'download';
  }

  private createZipEntryName(fileName: string) {
    return (
      fileName
        .replace(/["\r\n]/g, '')
        .replace(/[\\/]/g, '_')
        .trim() || 'download'
    );
  }

  private uniquifyZipEntryNames(
    entries: Array<{ name: string; buffer: Buffer }>,
  ) {
    const seen = new Map<string, number>();

    return entries.map((entry) => {
      const count = seen.get(entry.name) ?? 0;
      seen.set(entry.name, count + 1);

      if (count === 0) {
        return entry;
      }

      const extension = extname(entry.name);
      const baseName = extension
        ? entry.name.slice(0, -extension.length)
        : entry.name;

      return {
        ...entry,
        name: `${baseName} (${count + 1})${extension}`,
      };
    });
  }

  private assertValidKey(key: string) {
    if (!key || !key.startsWith('uploads/') || key.includes('..')) {
      throw new AppException(
        'Invalid file key',
        HttpStatus.BAD_REQUEST,
        'INVALID_FILE_KEY',
      );
    }
  }

  private toUtf8FileName(fileName: string) {
    return Buffer.from(fileName, 'latin1').toString('utf8');
  }

  private cleanMetadataValue(value?: string) {
    return value?.replace(/[\r\n]/g, '').trim() || '';
  }

  private createAttachmentHeader(fileName: string) {
    const cleanFileName = fileName.replace(/["\r\n]/g, '').trim() || 'download';
    const asciiName = cleanFileName.replace(/[^\x20-\x7E]/g, '_');

    return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`;
  }

  private createZipBuffer(entries: Array<{ name: string; buffer: Buffer }>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBuffer = Buffer.from(entry.name, 'utf8');
      const crc = this.crc32(entry.buffer);
      const localHeader = Buffer.alloc(30);

      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6);
      localHeader.writeUInt16LE(0, 8);
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(entry.buffer.length, 18);
      localHeader.writeUInt32LE(entry.buffer.length, 22);
      localHeader.writeUInt16LE(nameBuffer.length, 26);
      localHeader.writeUInt16LE(0, 28);
      localParts.push(localHeader, nameBuffer, entry.buffer);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0x0800, 8);
      centralHeader.writeUInt16LE(0, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(entry.buffer.length, 20);
      centralHeader.writeUInt32LE(entry.buffer.length, 24);
      centralHeader.writeUInt16LE(nameBuffer.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);
      centralParts.push(centralHeader, nameBuffer);

      offset += localHeader.length + nameBuffer.length + entry.buffer.length;
    }

    const centralDirectorySize = centralParts.reduce(
      (total, part) => total + part.length,
      0,
    );
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectorySize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, ...centralParts, end]);
  }

  private crc32(buffer: Buffer) {
    let crc = 0xffffffff;

    for (const byte of buffer) {
      crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xff];
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  private getClient(config: R2Config) {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        region: 'auto',
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    }

    return this.client;
  }

  private async getObjectMetadata(config: R2Config, key: string) {
    try {
      const response = await this.getClient(config).send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );

      return response.Metadata ?? {};
    } catch (error) {
      console.log('Error loading file metadata from R2:', error);
      return {};
    }
  }

  private getConfig(): R2Config {
    if (this.config) {
      return this.config;
    }

    const config = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      publicUrl: process.env.R2_PUBLIC_URL,
    };

    const missing = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length) {
      throw new AppException(
        `Missing R2 config: ${missing.join(', ')}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'R2_CONFIG_MISSING',
      );
    }

    this.config = config as R2Config;

    return this.config;
  }
}

const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value =
      value & 1 ? (0xedb88320 ^ (value >>> 1)) >>> 0 : (value >>> 1) >>> 0;
  }

  return value >>> 0;
});
