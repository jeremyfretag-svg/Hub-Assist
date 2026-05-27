import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { SubmitContactDto } from './dto/submit-contact.dto';
import { PaginationQueryDto } from '../common/pagination/dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@ApiTags('contact')
@Controller({ version: '1', path: 'contact' })
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a contact message' })
  @ApiResponse({ status: 201, description: 'Contact message submitted successfully' })
  async submitContact(@Body() dto: SubmitContactDto, @Req() req: Request) {
    const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown') as string;
    return this.contactService.submitContact(dto, ipAddress);
  }

  @Get('messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get all contact messages (admin only, paginated)' })
  @ApiResponse({ status: 200, description: 'Contact messages retrieved successfully' })
  async getMessages(@Query() query: PaginationQueryDto) {
    return this.contactService.getMessages(query);
  }
}
