import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProfileTables1784802506452 implements MigrationInterface {
    name = 'CreateProfileTables1784802506452'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctor_profiles" DROP COLUMN "consultationFee"`);
        await queryRunner.query(`ALTER TABLE "doctor_profiles" DROP COLUMN "availability"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctor_profiles" ADD "availability" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor_profiles" ADD "consultationFee" numeric NOT NULL`);
    }

}
