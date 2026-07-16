import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import {
  CreateSmtpIntegrationDto,
  DeleteIntegrationDto,
  TestSmtpIntegrationDto,
  UpdateSmtpIntegrationDto,
} from './dto/integration.dto';
import { IntegrationsService } from './integrations.service';
import { SmtpMailService } from './smtp-mail.service';

@Controller('v1/admin/integrations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminIntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly smtp: SmtpMailService,
  ) {}

  @Get()
  list(@Query('type') type?: string) {
    return this.integrations.list(type ?? 'smtp');
  }

  @Post('smtp')
  createSmtp(@Body() dto: CreateSmtpIntegrationDto) {
    return this.integrations.createSmtp(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSmtpIntegrationDto) {
    return this.integrations.update(id, dto);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Body() dto: TestSmtpIntegrationDto) {
    return this.smtp.sendTest(id, dto.to);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto?: DeleteIntegrationDto) {
    return this.integrations.remove(id, dto?.replacementIntegrationId);
  }
}
