import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCascadeDelete1786039418492 implements MigrationInterface {
    name = 'AddCascadeDelete1786039418492'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctor_profiles" DROP CONSTRAINT "FK_a798afca9436b00dac80f911a83"`);
        await queryRunner.query(`ALTER TABLE "patient_profiles" DROP CONSTRAINT "FK_fc4788002ae2de0a68f6ccf24e5"`);
        await queryRunner.query(`ALTER TABLE "doctor_profiles" ADD CONSTRAINT "FK_a798afca9436b00dac80f911a83" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "patient_profiles" ADD CONSTRAINT "FK_fc4788002ae2de0a68f6ccf24e5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patient_profiles" DROP CONSTRAINT "FK_fc4788002ae2de0a68f6ccf24e5"`);
        await queryRunner.query(`ALTER TABLE "doctor_profiles" DROP CONSTRAINT "FK_a798afca9436b00dac80f911a83"`);
        await queryRunner.query(`ALTER TABLE "patient_profiles" ADD CONSTRAINT "FK_fc4788002ae2de0a68f6ccf24e5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "doctor_profiles" ADD CONSTRAINT "FK_a798afca9436b00dac80f911a83" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
