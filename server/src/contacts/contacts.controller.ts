// import { Controller, UseGuards, Post, Body, Get, ParseIntPipe, Param, Delete, Put } from '@nestjs/common';
// import { AuthGuard } from '@nestjs/passport';
// import { ContactDto } from "./dto";
// // import { ContactsService } from './contacts.service';


// @Controller('contacts')
// @UseGuards(AuthGuard('jwt'))
// export class ContactsController {
//     constructor(
//         private contactService: ContactsService,
//     ){}

//     // api/contacts - POST
//     // creare contact
//     @Post()
//     createContact(@Body() dto: ContactDto){
//         return this.contactService.createContact(dto);
//     }

//     // api/contacts - GET
//     // get all contacts
//     @Get()
//     getContacts(){
//         return this.contactService.getContacts();
//     }

//     // api/contacts/:id - GET BY ID
//     // get contact by id
//     @Get(':id')
//     getContactById(@Param('id', ParseIntPipe) id: number){
//         return this.contactService.getContactById(id);
//     }

//     // api/contacts/:id - PUT
//     // update contact
//     @Put(':id')
//     updateContact(@Param('id', ParseIntPipe) id: number, @Body() dto: ContactDto){
//         return this.contactService.updateContact(id, dto)
//     }

//     // api/contacts/:id - DELETE
//     // sterge contact
//     @Delete(':id')
//     deleteContact(@Param('id', ParseIntPipe) id: number) {
//         return this.contactService.deleteContact(id);
//     }
// }
