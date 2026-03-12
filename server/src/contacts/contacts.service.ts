// import { InternalServerErrorException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { Prisma } from "@prisma/client";
// import { ContactDto } from './dto';
// import { Contact } from '@prisma/client';
// import { returnValidResponse, SuccesResponse } from 'src/utils/crud.utils';

// @Injectable()
// export class ContactsService {
//     constructor(
//         private prisma: PrismaService
//     ){}

//     async createContact(dto: ContactDto): Promise<SuccesResponse<Contact>>{
//         try{
//             const contact = await this.prisma.contact.create({
//                 data: {
//                     ...dto,
//                     is_activ: true
//                 }
//             })
    
//             return returnValidResponse("Contactul a fost creat cu succes!", contact);
//         }
//         catch (error) {
//             throw new InternalServerErrorException('Eroare la crearea contactului. Va rugam sa incercati din nou.')
//         }
//     }

//     async getContacts(): Promise<Contact[]> {
//         try{
//             return await this.prisma.contact.findMany({
//                 orderBy: {
//                     date_created: 'desc'
//                 }
//             });
//         }
//         catch (error) {
//             throw new InternalServerErrorException('Eroare la preluarea contactelor.')
//         }
//     }

//     async getContactById(idContact: number): Promise<Contact> {
//         try {
//             const contact = await this.prisma.contact.findUniqueOrThrow({
//                 where: {
//                     id: idContact
//                 }
//             })
//             return contact;
//         }
//         catch (error){
//             if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
//                 throw new NotFoundException (`Contactul cu id ${idContact} nu a fost gasit`);
//             }
//             throw new InternalServerErrorException('Eroare la preluarea contactului.')
//         }
//     }

//     async updateContact(idContact: number, dto: ContactDto): Promise<SuccesResponse<Contact>> {
//         try{
//             const contact = await this.prisma.contact.update({
//                 data: {
//                     ...dto
//                 },
//                 where: {
//                     id: idContact
//                 }
//             })
    
//             return returnValidResponse("Contactul a fost actualizat cu succes!", contact);
//         }
//         catch (error) {
//             if (error instanceof Prisma.PrismaClientKnownRequestError) {
//                 if (error.code === 'P2025'){
//                     throw new NotFoundException('Contactul pe care incerci sa il actualizezi nu exista!')
//                 }
//             }
//             throw new InternalServerErrorException('Eroare la actualizarea contactului. Va rugam sa incercati din nou.')
//         }
//     }

//     async deleteContact(idContact: number): Promise<SuccesResponse<Contact>> {
//         try {
//             const contactSters = await this.prisma.contact.delete({
//                 where: {
//                     id: idContact
//                 }
//             });

//             return returnValidResponse("Contactul a fost sters cu succes!", contactSters);

//         }
//         catch (error){
//             if (error instanceof Prisma.PrismaClientKnownRequestError) {
//                 if (error.code === 'P2025'){
//                     throw new NotFoundException('Contactul pe care incerci sa il stergi nu exista!')
//                 }
//             }
//             throw new InternalServerErrorException ('Eroare la stergerea contactului.Va rugam sa incercati din nou')
//         }
//     }
// }
