import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAppointmentAndScheduling1784915629305 implements MigrationInterface {
    name = 'CreateAppointmentAndScheduling1784915629305'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "custom_slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "startTime" TIME NOT NULL, "endTime" TIME NOT NULL, "isBooked" boolean NOT NULL DEFAULT false, "availabilityId" uuid, CONSTRAINT "PK_d2ae4b2e645292a8c45c2a3d058" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "recurring_slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "startTime" TIME NOT NULL, "endTime" TIME NOT NULL, "availabilityId" uuid, CONSTRAINT "PK_49a145de4943286571a0fefa3a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."appointments_schedulingtype_enum" AS ENUM('STREAM', 'WAVE')`);
        await queryRunner.query(`CREATE TYPE "public"."appointments_status_enum" AS ENUM('BOOKED', 'CANCELLED', 'COMPLETED')`);
        await queryRunner.query(`CREATE TABLE "appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appointmentDate" date NOT NULL, "schedulingType" "public"."appointments_schedulingtype_enum" NOT NULL, "tokenNumber" integer, "status" "public"."appointments_status_enum" NOT NULL DEFAULT 'BOOKED', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "patientId" uuid, "doctorId" uuid, "customSlotId" uuid, "recurringSlotId" uuid, "customAvailabilityId" uuid, "recurringAvailabilityId" uuid, CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" DROP COLUMN "capacity"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP COLUMN "capacity"`);
        await queryRunner.query(`CREATE TYPE "public"."recurring_availability_schedulingtype_enum" AS ENUM('STREAM', 'WAVE')`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ADD "schedulingType" "public"."recurring_availability_schedulingtype_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ADD "bufferTime" integer`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ADD "maxCapacity" integer`);
        await queryRunner.query(`CREATE TYPE "public"."custom_availability_schedulingtype_enum" AS ENUM('STREAM', 'WAVE')`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD "schedulingType" "public"."custom_availability_schedulingtype_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD "bufferTime" integer`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD "maxCapacity" integer`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD "bookedPatients" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ALTER COLUMN "duration" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ALTER COLUMN "duration" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "custom_slots" ADD CONSTRAINT "FK_fd0c55ef9e8eec7cd416c91c95f" FOREIGN KEY ("availabilityId") REFERENCES "custom_availability"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_slots" ADD CONSTRAINT "FK_ee7815d5f74d354e8ed75b89f9f" FOREIGN KEY ("availabilityId") REFERENCES "recurring_availability"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_13c2e57cb81b44f062ba24df57d" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_0c1af27b469cb8dca420c160d65" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_efc363e6d523fbe01df8ce2c86f" FOREIGN KEY ("customSlotId") REFERENCES "custom_slots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_ec0bce713cc0eca9255144b521b" FOREIGN KEY ("recurringSlotId") REFERENCES "recurring_slots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_852041522741282b3f96b5501fa" FOREIGN KEY ("customAvailabilityId") REFERENCES "custom_availability"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_192894c8882bc57dd719293843f" FOREIGN KEY ("recurringAvailabilityId") REFERENCES "recurring_availability"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_192894c8882bc57dd719293843f"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_852041522741282b3f96b5501fa"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_ec0bce713cc0eca9255144b521b"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_efc363e6d523fbe01df8ce2c86f"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_0c1af27b469cb8dca420c160d65"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_13c2e57cb81b44f062ba24df57d"`);
        await queryRunner.query(`ALTER TABLE "recurring_slots" DROP CONSTRAINT "FK_ee7815d5f74d354e8ed75b89f9f"`);
        await queryRunner.query(`ALTER TABLE "custom_slots" DROP CONSTRAINT "FK_fd0c55ef9e8eec7cd416c91c95f"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ALTER COLUMN "duration" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ALTER COLUMN "duration" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP COLUMN "bookedPatients"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP COLUMN "maxCapacity"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP COLUMN "bufferTime"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP COLUMN "schedulingType"`);
        await queryRunner.query(`DROP TYPE "public"."custom_availability_schedulingtype_enum"`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" DROP COLUMN "maxCapacity"`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" DROP COLUMN "bufferTime"`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" DROP COLUMN "schedulingType"`);
        await queryRunner.query(`DROP TYPE "public"."recurring_availability_schedulingtype_enum"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD "capacity" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ADD "capacity" integer NOT NULL`);
        await queryRunner.query(`DROP TABLE "appointments"`);
        await queryRunner.query(`DROP TYPE "public"."appointments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."appointments_schedulingtype_enum"`);
        await queryRunner.query(`DROP TABLE "recurring_slots"`);
        await queryRunner.query(`DROP TABLE "custom_slots"`);
    }

}
