import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticateToken } from '../modules/auth/auth.middleware';
import { prisma } from '../prisma';

function formatCsvValue(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

const reportRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // GET /reports/notifications?start=ISO&end=ISO&companyId=optional
    fastify.get(
        '/notifications',
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const { start, end, companyId } = request.query as {
                    start?: string;
                    end?: string;
                    companyId?: string;
                };

                if (!start || !end) {
                    reply.status(400).send({ error: 'start and end are required ISO timestamps' });
                    return;
                }

                const startDate = new Date(start);
                const endDate = new Date(end);
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                    reply.status(400).send({ error: 'Invalid start or end timestamp' });
                    return;
                }

                const where: any = {
                    timeSent: {
                        gte: startDate,
                        lte: endDate,
                    },
                };
                if (companyId) {
                    const idNum = parseInt(companyId, 10);
                    if (!Number.isNaN(idNum)) where.companyId = idNum;
                }

                const logs = await prisma.notificationLog.findMany({
                    where,
                    include: { company: { select: { id: true, name: true } } },
                    orderBy: { timeSent: 'asc' },
                });

                // Minimal CSV: transaction hash, transaction time, recipient address, token, USD value, account name
                const headers = [
                    'transaction_hash',
                    'transaction_time_utc',
                    'recipient_address',
                    'token',
                    'usd_value',
                    'account_manager',
                ];

                const rows: string[] = [];
                rows.push(headers.join(','));
                for (const log of logs) {
                    const payload: any = log.payload as any;
                    const line = [
                        formatCsvValue(payload?.transactionHash ?? ''),
                        // Using log.timeSent as transaction time proxy
                        formatCsvValue(log.timeSent.toISOString()),
                        formatCsvValue(payload?.recipientAddress ?? ''),
                        formatCsvValue(payload?.tokenSymbol ?? ''),
                        formatCsvValue(payload?.usdValue ?? ''),
                        formatCsvValue((payload?.accountManager ?? (payload?.account_manager ?? ''))),

                    ].join(',');
                    rows.push(line);
                }

                const csv = rows.join('\n');
                const filename = `notifications-${startDate.toISOString().slice(0, 10)}_${endDate
                    .toISOString()
                    .slice(0, 10)}.csv`;

                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', `attachment; filename=${filename}`);
                reply.send(csv);
            } catch (err: any) {
                fastify.log.error(err);
                reply.status(500).send({ error: 'Failed to generate report' });
            }
        }
    );
};

export default reportRoutes;


