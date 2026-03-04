import { Controller, UseGuards, Post, Body, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContactDto } from "./dto";
import { ContactsService } from './contacts.service';
import { PrismaService } from 'src/prisma/prisma.service';


@Controller('contacts')
export class ContactsController {
    constructor(
        private contactService: ContactsService,
    ){}

    // api/contacts/create - POST
    // creare contact
    @UseGuards(AuthGuard('jwt'))
    @Post('create')
    createContact(@Body() dto: ContactDto){
        return this.contactService.createContact(dto);
    }

    // api/contacts - GET
    // get all contacts
    @UseGuards(AuthGuard('jwt'))
    @Get()
    getContacts(){
        return this.contactService.getContacts();
    }
}
