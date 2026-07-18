import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import type { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { FileStorageService } from './file-storage.service';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('v1/files')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(
    private readonly files: FileStorageService,
  ) {}

  @Post('upload-sessions')
  async createUploadSession(
    @Body() dto: CreateUploadSessionDto,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Sesiunea de upload a fost creata.',
      await this.files.createUploadSession(
        dto,
        req.user,
      ),
    );
  }

  @Post('upload-sessions/:fileId/complete')
  async complete(
    @Param('fileId') fileId: string,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Fisierul a fost confirmat.',
      await this.files.completeUpload(
        fileId,
        req.user,
      ),
    );
  }

  @Get(':fileId')
  async metadata(
    @Param('fileId') fileId: string,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Metadate fisier.',
      await this.files.metadata(fileId, req.user),
    );
  }

  @Get(':fileId/download-url')
  async download(
    @Param('fileId') fileId: string,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Link de descarcare.',
      await this.files.downloadUrl(
        fileId,
        req.user,
      ),
    );
  }

  @Delete(':fileId')
  async remove(
    @Param('fileId') fileId: string,
    @Req() req: RequestWithUser,
  ) {
    await this.files.remove(fileId, req.user);
    return returnValidResponse(
      'Fisierul a fost eliminat.',
      null,
    );
  }
}
