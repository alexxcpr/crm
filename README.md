## 🚀 Roadmap Implementare CRM

cum va functiona in end
    user alege oferta: CRMini / CRMedium / CRMax / CRMega
    Toate au acelasi codebase.. 
    La toate se creeaza un server, in functie de server se fac configurarile serverului (memroie RAM, storage, db)
    In functie de oferta aleasa are acces la anumite optiuni ale platformei 

    optiunile aferente ofertelor:
        se afiseaza in functie de offer_type.   offer_type se seteaza la achizitia unei oferte

### 1. 🏢 Gestiunea Entităților Principale (Core CRM)
- [ ] **Modul Companii (Accounts)**
  - [ ] Creare model `Company` în Prisma (Nume, CUI, Adresă, Industrie, Website, etc.).
  - [ ] Asociere One-to-Many între `Company` și `Contact` (un contact aparține de o companie).
  - [ ] Pagini de listare (Tabel) și detaliu pentru companie.
- [ ] **Modul Oportunități / Vânzări (Leads & Deals)**
  - [ ] Creare model `Deal` (Titlu, Valoare estimată, Stadiu, Dată estimată închidere).
  - [ ] Pipeline de vânzări (Kanban board - ex: *Lead Nou -> Contactat -> Ofertă Trimisă -> Câștigat/Pierdut*).
  - [ ] Legătură între Deal și Companie/Contact.

### 2. 📅 Activități și Istoric (Interacțiuni)
- [ ] **Modul Sarcini (Tasks)**
  - [ ] Creare model `Task` (Descriere, Dată scadentă, Status, Asignat către user).
  - [ ] Asociere sarcini la Contacte sau Companii.
  - [ ] Notificări vizuale în aplicație pentru task-uri expirate/urgente.
- [ ] **Jurnal de Interacțiuni (Notes & Logs)**
  - [ ] Posibilitatea de a adăuga notițe (Notes) pe profilul unui Contact/Companie.
  - [ ] Înregistrarea unui istoric de acțiuni (ex: *E-mail trimis*, *Apel telefonic efectuat*).

### 3. 🔐 Securitate, Utilizatori și Echipă
- [ ] **Roluri și Permisiuni (RBAC)**
  - [ ] Adăugare câmp `role` în modelul `User` (ex: `ADMIN`, `MANAGER`, `AGENT`).
  - [ ] Restricționare acces: un agent vede doar contactele și deal-urile lui; managerul vede tot.
- [ ] **Gestiunea Contului**
  - [ ] Flux de "Am uitat parola" (Reset password cu token prin e-mail).
  - [ ] Pagina de profil utilizator (schimbare parolă, actualizare nume/avatar).

### 4. 📊 Dashboard și Analize (Reporting)
- [ ] **Dashboard Principal (Acasă)**
  - [ ] Afișare metrici cheie (KPI): Număr contacte noi, Valoare totală pipeline, Deal-uri câștigate luna asta.
  - [ ] Widget cu "Sarcinile mele de azi" (My tasks today).
  - [ ] Grafice (Charts) pentru evoluția vânzărilor sau sursa lead-urilor.

### 5. ⚙️ Funcționalități Utilitare / UX
- [ ] **Căutare Globală (Global Search)**
  - [ ] Un search bar sus care să caute rapid prin Contacte, Companii și Deal-uri.
- [ ] **Export & Import Date**
  - [ ] Buton de Export contacte în CSV / Excel.
  - [ ] Import de contacte inițiale dintr-un fișier CSV.
- [ ] **Filtrare și Sortare Avansată**
  - [ ] Filtrare contacte după funcție (`pozitie`), decizionali (`isDecisionMaker`), etc.

## De luat in calcul
- import date din excel -> contacte, companii   (sa se faca mai usor tranzitia catre CRM meu din alte CRM)


## Ghid start
- pornire db (docker)
    - cd docker && docker compose up -d
- pornire backend
    - cd server && npm install
- pornire frontend
    - cd client && pnpm install


- scripturi backend:
    restart db (delete container + create container): db-dev-restart



## API
### Contact
/api/contacts     - POST   - creare contact
/api/contacts     - GET    - get all contacts
/api/contacts/:id - GET    - get contact by id
/api/contacts/:id - PUT    - update contact
/api/contacts/:id - DELETE - delete contact