import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProfileTables1784738288943 implements MigrationInterface {
    name = 'CreateProfileTables1784738288943'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patient_profiles" DROP COLUMN "mobileNumber"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patient_profiles" ADD "mobileNumber" character varying NOT NULL`);
    }

}
