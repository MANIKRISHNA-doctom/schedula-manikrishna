import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsReadToNotification1786473563283 implements MigrationInterface {
    name = 'AddIsReadToNotification1786473563283'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" ADD "isRead" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "isRead"`);
    }

}
