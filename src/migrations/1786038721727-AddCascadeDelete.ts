import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCascadeDelete1786038721727 implements MigrationInterface {
    name = 'AddCascadeDelete1786038721727'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recurring_availability" DROP CONSTRAINT "FK_5c644a995dc9bed981684fb32f8"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP CONSTRAINT "FK_1a33c02748c794ea9bf0a13fbf0"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_13c2e57cb81b44f062ba24df57d"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_0c1af27b469cb8dca420c160d65"`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ADD CONSTRAINT "FK_5c644a995dc9bed981684fb32f8" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD CONSTRAINT "FK_1a33c02748c794ea9bf0a13fbf0" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_13c2e57cb81b44f062ba24df57d" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_0c1af27b469cb8dca420c160d65" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_0c1af27b469cb8dca420c160d65"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_13c2e57cb81b44f062ba24df57d"`);
        await queryRunner.query(`ALTER TABLE "custom_availability" DROP CONSTRAINT "FK_1a33c02748c794ea9bf0a13fbf0"`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" DROP CONSTRAINT "FK_5c644a995dc9bed981684fb32f8"`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_0c1af27b469cb8dca420c160d65" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_13c2e57cb81b44f062ba24df57d" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "custom_availability" ADD CONSTRAINT "FK_1a33c02748c794ea9bf0a13fbf0" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "recurring_availability" ADD CONSTRAINT "FK_5c644a995dc9bed981684fb32f8" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
