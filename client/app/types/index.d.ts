import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface ContactDto {
  id: number
  nume: string | null
  prenume: string | null
  email_companie: string | null
  is_activ: boolean | null
  is_decision_maker: boolean | null
  profil_linkedin: string | null
  telefon1: string | null
  telefon2: string | null
  pozitie: string | null
  email_alternativ: string | nulll
}
export interface Contact {
  id: number
  nume: string | null
  prenume: string | null
  emailCompanie: string | null
  isActiv: boolean | null
  isDecisionMaker: boolean | null
  profilLinkedin: string | null
  telefon1: string | null
  telefon2: string | null
  pozitie: string | null
  emailAlternativ: string | nulll
}

export interface SursaDto {
  //TODO
}
export interface Sursa {
  //TODO
}

export interface FazaDto {
  //TODO
}
export interface Faza {
  //TODO
}

export interface ProiectTipDto {
  //TODO
}
export interface ProiectTip {
  //TODO
}

export interface CompanieDto {
  //TODO
}
export interface Companie {
  //TODO
}

export interface PipelineStareDto {
  //TODO
}
export interface PipelineStare {
  //TODO
}

export interface UserDto {
  id: number
  name: string
  email: string
}
export interface User {
  id: number
  name: string
  email: string
}

export interface LeadDto {
  id: number
  denumire: string | null
  is_activ: boolean | null
  is_expert_tehnic_identificat: boolean | null
  is_buget_confirmat: boolean | null
  is_termen_definit: boolean | null
  is_buget_prevazut: boolean | null
  is_nevoi_identificate: boolean | null
  is_cerinta_tehnica: boolean | null
  is_altele: boolean | null
  is_proiect_arie_expertiza: boolean | null
  is_autoritate: boolean | null
  id_user_alocat_la: number | null
  id_contact: number | null
  id_sursa: number | null
  id_faza: number | null
  id_proiect_tip: number | null
  id_companie: number | null
  id_pipeline_stare: number | null
  id_oportunitate: number | null
}

export interface Lead {
  id: number,
  denumire: string | null
  isActiv: boolean | null
  isExpertTehnicIdentificat: boolean | null
  isBugetConfirmat: boolean | null
  isNevoiIdentificate: boolean | null
  isCerintaTehnica: boolean | null
  isProiectArieExpertiza: boolean | null
  isAutoritate: boolean | null
  isAltele: boolean | null
  userAlocatLaId: User | null
  contactId: number | null
  sursaId: number | null
  fazaId: number | null
  proiectTipId: number | null
  companieId: number | null
  pipelineStareId: number | null
  oportunitateId: number | null
}

// Ce am adaugat eu nou (sus)
//----------------------------
// Ce era inainte (jos)

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: AvatarProps
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}