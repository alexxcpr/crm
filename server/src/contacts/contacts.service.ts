import { InternalServerErrorException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContactDto } from './dto';
import { Contact } from '@prisma/client';

@Injectable()
export class ContactsService {
    constructor(
        private prisma: PrismaService
    ){}

    async createContact(dto: ContactDto): Promise<Contact>{
        try{
            const contact = await this.prisma.contact.create({
                data: {
                    nume: dto.nume,
                    prenume: dto.prenume,
                    email_companie: dto.email_companie,
                    email_alternativ: dto.email_alternativ,
                    telefon1: dto.telefon1,
                    telefon2: dto.telefon2,
                    pozitie: dto.pozitie,
                    profile_linkedin: dto.profile_linkedin,
                    is_activ: true,
                    is_decision_maker: dto.is_decision_maker
                }
            })
    
            return contact;
        }
        catch (error) {
            throw new InternalServerErrorException('Eroare la crearea contactului. Va rugam sa incercati din nou.')
        }
    }

    async getContacts(): Promise<Contact[]> {
        try{
            return await this.prisma.contact.findMany({
                orderBy: {
                    date_created: 'desc'
                }
            });
        }
        catch (error) {
            throw new InternalServerErrorException('Eroare la preluarea contactelor.')
        }
    }

    async getContactById(idContact: number): Promise<Contact> {
        try {
            const contact = await this.prisma.contact.findUnique({
                where: {
                    id: idContact
                }
            })

            if (!contact){
                throw new NotFoundException (`Contactul cu id ${idContact} nu a fost gasit`);
            }

            return contact;
        }
        catch (error){
            throw new InternalServerErrorException('Eroare la preluarea contactului.')
        }
    }
}
