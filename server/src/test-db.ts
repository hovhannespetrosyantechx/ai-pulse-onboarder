import { prisma } from "./lib/prisma"

async function main() {
  const doc = await prisma.document.create({
    data: {
      name: "test-doc",
      originalName: "test-doc.pdf",
      type: "pdf",
      size: 1234,
      extractedText: "Hello world",
      chunks: ["Hello", "world"],
      status: "ready",
    },
  })

  console.log("Created:", doc)

  const found = await prisma.document.findUnique({
    where: { id: doc.id },
  })

  console.log("Found:", found)

  await prisma.document.delete({ where: { id: doc.id } })
  console.log("Deleted — database is clean")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
  