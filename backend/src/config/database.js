const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Prevent multiple instances during dev hot-reloads
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });
    global.__prisma.$on('query', (e) => {
      logger.debug(`Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`);
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
