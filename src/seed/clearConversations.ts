import { PrismaClient } from "@prisma/client"

const primsa = new PrismaClient()

const main = async (): Promise<void> => {
    console.log("Clearing all conversations...");
    await primsa.conversation.deleteMany();
    console.log("✅ All conversations cleared successfully.");
}

main()
    .catch((e) => {
        console.error("❌ Error clearing conversations:", e);
        process.exit(1);
    })
    .finally(async () => {
        await primsa.$disconnect();
    });