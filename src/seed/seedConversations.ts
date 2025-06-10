// prisma/seed.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Predefined user IDs; assume these users already exist in the database
const userIds = [
  "4200ff7b-b6f4-4a20-849c-8435788f63fe",
  "5622c196-83d1-458f-b577-cc9ee2d56715",
  "9e4c9c3a-1036-4e51-87f6-cdbf1edec28f",
  "a4e35c50-6733-4c0a-8a15-aec4aea2fa0b",
];

// A simple map from user ID → readable name for seed data
const userNames: Record<string, string> = {
  "4200ff7b-b6f4-4a20-849c-8435788f63fe": "Alex",
  "5622c196-83d1-458f-b577-cc9ee2d56715": "Blake",
  "9e4c9c3a-1036-4e51-87f6-cdbf1edec28f": "Casey",
  "a4e35c50-6733-4c0a-8a15-aec4aea2fa0b": "Dana",
};

async function main() {
  // Utility—given an array and an element, return the array without that element
  function othersOf(id: string) {
    return userIds.filter((uid) => uid !== id);
  }

  for (const authorId of userIds) {
    const others = othersOf(authorId);
    const authorName = userNames[authorId];

    // -----------------------------
    // 1-on-1 Conversations
    // -----------------------------

    // We’ll pick the first two “others” for one-on-ones
    const oneOnOneTargets = others.slice(0, 2);

    for (const otherId of oneOnOneTargets) {
      const otherName = userNames[otherId];
      // Title is simply both names
      const convoTitle = `${authorName} & ${otherName}`;

      // Create the conversation
      const convo = await prisma.conversation.create({
        data: {
          title: convoTitle,
          author: { connect: { id: authorId } },
          participants: {
            connect: [{ id: authorId }, { id: otherId }],
          },
        },
      });

      // Seed about 3 “gossip‐style” messages, alternating senders
      const oneOnOneLines = [
        // i = 0 → from author to other
        () =>
          `Hey ${otherName}, did you hear about that new dating app everyone's using?`,
        // i = 1 → from other to author
        () =>
          `Not really—I've seen people on Insta talking about it. You tried it yet?`,
        // i = 2 → from author to other
        () => `Yeah, signed up last night. Already swiped right on someone interesting!`
      ];

      for (let i = 0; i < oneOnOneLines.length; i++) {
        const senderId = i % 2 === 0 ? authorId : otherId;
        const content = oneOnOneLines[i]();
        await prisma.message.create({
          data: {
            content,
            sender: { connect: { id: senderId } },
            conversation: { connect: { id: convo.id } },
          },
        });
      }
    }

    // -----------------------------
    // Group Conversations
    // -----------------------------

    // All combinations of “others” taken two at a time:
    const groupCombos: [string, string][] = [
      [others[0], others[1]],
      [others[0], others[2]],
      [others[1], others[2]],
    ];

    for (const [otherA, otherB] of groupCombos) {
      const nameA = userNames[otherA];
      const nameB = userNames[otherB];
      const participantIds = [authorId, otherA, otherB];
      const participantNames = [authorName, nameA, nameB];

      // Title: “Gossip: Alex, Blake, Casey” etc.
      const convoTitle = `Gossip: ${participantNames.join(", ")}`;

      // Create the group conversation
      const convo = await prisma.conversation.create({
        data: {
          title: convoTitle,
          author: { connect: { id: authorId } },
          participants: {
            connect: participantIds.map((id) => ({ id })),
          },
        },
      });

      // Seed 3 group‐style messages in a “chatty/gossip” tone
      const groupLines = [
        // i = 0 → from author
        () =>
          `Did you guys hear about ${participantNames[1]}'s date last night?`,
        // i = 1 → from otherA
        () => `No way! What happened? Tell me everything.`,
        // i = 2 → from otherB
        () =>
          `${participantNames[1]} got stood up and ended up crying into their latte! 😂`,
      ];

      for (let i = 0; i < groupLines.length; i++) {
        const senderIndex = i % participantIds.length;
        const senderId = participantIds[senderIndex];
        const content = groupLines[i]();
        await prisma.message.create({
          data: {
            content,
            sender: { connect: { id: senderId } },
            conversation: { connect: { id: convo.id } },
          },
        });
      }
    }
  }

  console.log("✅ Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
