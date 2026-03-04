-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,
    "nume" TEXT,
    "prenume" TEXT,
    "email_companie" TEXT,
    "is_activ" BOOLEAN,
    "is_decision_maker" BOOLEAN,
    "profile_linkedin" TEXT,
    "telefon1" TEXT,
    "telefon2" TEXT,
    "pozitie" TEXT,
    "email_alternativ" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
