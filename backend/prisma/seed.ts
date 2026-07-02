import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const factory = await prisma.factory.upsert({
    where: { id: 'factory-001' },
    update: {},
    create: { id: 'factory-001', name: 'Factory Alpha', location: 'Mumbai, India', timezone: 'Asia/Kolkata' },
  });

  const adminHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@factory-alpha.com' },
    update: {},
    create: { email: 'admin@factory-alpha.com', passwordHash: adminHash, firstName: 'Admin', lastName: 'User', role: 'ADMIN', factoryId: factory.id },
  });

  const supervisorHash = await bcrypt.hash('Super@123', 12);
  await prisma.user.upsert({
    where: { email: 'supervisor@factory-alpha.com' },
    update: {},
    create: { email: 'supervisor@factory-alpha.com', passwordHash: supervisorHash, firstName: 'Sara', lastName: 'Singh', role: 'SUPERVISOR', factoryId: factory.id },
  });

  const workerHash = await bcrypt.hash('Worker@123', 12);
  await prisma.user.upsert({
    where: { email: 'worker@factory-alpha.com' },
    update: {},
    create: { email: 'worker@factory-alpha.com', passwordHash: workerHash, firstName: 'Raj', lastName: 'Kumar', role: 'WORKER', factoryId: factory.id },
  });

  const machines = ['Loom-001', 'Loom-002', 'Compressor-A', 'Motor-B', 'Conveyor-C'];
  for (const name of machines) {
    await prisma.machine.upsert({
      where: { serialNumber: `SN-${name}` },
      update: {},
      create: { name, serialNumber: `SN-${name}`, location: 'Floor 1', factoryId: factory.id, status: 'ONLINE' },
    });
  }

  const machine = await prisma.machine.findFirst({ where: { factoryId: factory.id } });
  if (machine) {
    await prisma.alert.create({
      data: {
        title: 'High temperature detected',
        description: 'Temperature sensor reading above threshold: 95°C',
        severity: 'CRITICAL',
        status: 'OPEN',
        machineId: machine.id,
        factoryId: factory.id,
        timeline: { create: { eventType: 'ALERT_CREATED', description: 'Alert created with severity CRITICAL' } },
      },
    });
  }

  console.log('✅ Seed complete');
  console.log('   admin@factory-alpha.com / Admin@123');
  console.log('   supervisor@factory-alpha.com / Super@123');
  console.log('   worker@factory-alpha.com / Worker@123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
