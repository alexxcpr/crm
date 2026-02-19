-- 01_contacts.sql
-- Schema + mock data pentru contacts, conform structurii din Contact (index.d.ts)
-- Comanda import din terminal PowerShell: Get-Content .\docker\postgres\init\01_contacts.sql -Raw | docker exec -i crm-postgres psql -U crm_user -d crm_db

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT PRIMARY KEY,
  nume TEXT NULL,
  prenume TEXT NULL,
  email_companie TEXT NULL,
  is_activ BOOLEAN NULL,
  is_decision_maker BOOLEAN NULL,
  profil_linkedin TEXT NULL,
  telefon1 TEXT NULL,
  telefon2 TEXT NULL,
  pozitie TEXT NULL,
  email_alternativ TEXT NULL
);

-- Optional: unicitate pe email companie (ignora NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ux_contacts_email_companie
  ON contacts (email_companie)
  WHERE email_companie IS NOT NULL;

INSERT INTO contacts (
  id, nume, prenume, email_companie, is_activ, is_decision_maker,
  profil_linkedin, telefon1, telefon2, pozitie, email_alternativ
) VALUES
(1, 'Popescu', 'Andrei', 'andrei.popescu@acme.ro', true, true, 'https://linkedin.com/in/andreipopescu', '0711111111', NULL, 'CEO', 'andrei.personal@gmail.com'),
(2, 'Ionescu', 'Maria', 'maria.ionescu@acme.ro', true, false, 'https://linkedin.com/in/mariaionescu', '0722222222', '0213000001', 'Sales Manager', NULL),
(3, 'Dumitru', 'Vlad', NULL, true, false, NULL, '0733333333', NULL, 'Technical Lead', 'vlad.alt@yahoo.com'),
(4, 'Georgescu', 'Elena', 'elena.georgescu@globex.ro', false, true, 'https://linkedin.com/in/elenageorgescu', NULL, NULL, 'Procurement Director', NULL),
(5, 'Radu', 'Mihai', 'mihai.radu@initech.ro', true, NULL, NULL, '0744444444', NULL, NULL, NULL),
(6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
