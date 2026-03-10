-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module" (
    "id_module" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "rank" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_pkey" PRIMARY KEY ("id_module")
);

-- CreateTable
CREATE TABLE "entity" (
    "id_entity" TEXT NOT NULL,
    "id_module" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "label_singular" VARCHAR(100),
    "label_plural" VARCHAR(100),
    "rank" INTEGER NOT NULL DEFAULT 0,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_pkey" PRIMARY KEY ("id_entity")
);

-- CreateTable
CREATE TABLE "field" (
    "id_field" TEXT NOT NULL,
    "id_entity" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "column_name" VARCHAR(100) NOT NULL,
    "data_type" VARCHAR(50) NOT NULL,
    "ui_type" VARCHAR(50) NOT NULL,
    "default_value" TEXT,
    "placeholder" VARCHAR(255),
    "help_text" VARCHAR(500),
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_unique" BOOLEAN NOT NULL DEFAULT false,
    "is_filterable" BOOLEAN NOT NULL DEFAULT true,
    "is_sortable" BOOLEAN NOT NULL DEFAULT true,
    "visible_in_table" BOOLEAN NOT NULL DEFAULT true,
    "visible_in_form" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "validation_rules" JSONB,
    "id_relation_entity" TEXT,
    "relation_display_field" VARCHAR(100),
    "group_name" VARCHAR(100) NOT NULL DEFAULT 'general',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_pkey" PRIMARY KEY ("id_field")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "module_slug_key" ON "module"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "entity_slug_key" ON "entity"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "entity_table_name_key" ON "entity"("table_name");

-- CreateIndex
CREATE UNIQUE INDEX "field_id_entity_slug_key" ON "field"("id_entity", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "field_id_entity_column_name_key" ON "field"("id_entity", "column_name");

-- AddForeignKey
ALTER TABLE "entity" ADD CONSTRAINT "entity_id_module_fkey" FOREIGN KEY ("id_module") REFERENCES "module"("id_module") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field" ADD CONSTRAINT "field_id_entity_fkey" FOREIGN KEY ("id_entity") REFERENCES "entity"("id_entity") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field" ADD CONSTRAINT "field_id_relation_entity_fkey" FOREIGN KEY ("id_relation_entity") REFERENCES "entity"("id_entity") ON DELETE SET NULL ON UPDATE CASCADE;
