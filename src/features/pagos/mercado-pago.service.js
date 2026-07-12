import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { prisma } from '../../config/database.config.js';
import { pagosService } from '../pagos/pagos.service.js';

const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });

export const mercadoPagoService = {
  
  crearPreferencia: async (deuda, monto) => {
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [{
          id: deuda.id.toString(),
          title: `Club Gema - Pago de mensualidad`,
          quantity: 1,
          unit_price: Number(monto || deuda.monto_final),
          currency_id: 'PEN',
        }],
        back_urls: {
          success: `${process.env.FRONTEND_URL}/student/enrollment?status=approved`,
          failure: `${process.env.FRONTEND_URL}/student/enrollment?status=failure`,
          pending: `${process.env.FRONTEND_URL}/student/enrollment?status=pending`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL}/api/pagos/webhook-mp`,
        external_reference: deuda.id.toString(),
      }
    });
    return result.init_point;
  },

  verificarYActualizarPago: async (paymentId) => {
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: paymentId });
    const { status, external_reference, transaction_amount } = paymentInfo;

    if (status === 'approved') {
      const deuda_id = parseInt(external_reference);
      
      // Ejecutamos todo dentro de una transacción para asegurar consistencia idéntica al flujo manual
      return await prisma.$transaction(async (tx) => {
        
        // 1. Buscamos la deuda asociada para conocer al alumno
        const deuda = await tx.cuentas_por_cobrar.findUnique({
          where: { id: deuda_id }
        });

        if (!deuda) {
          console.error(`❌ [WEBHOOK MP] Deuda ID ${deuda_id} no encontrada en la base de datos.`);
          return { success: false };
        }

        // 2. Simulamos el "Escudo protector" del flujo manual: Pasar inscripciones a 'POR_VALIDAR'
        // Esto es vital porque tu función validarPago exige que las inscripciones estén en 'POR_VALIDAR' para activarlas.
        await tx.cuentas_por_cobrar.update({
          where: { id: deuda_id },
          data: { estado: 'POR_VALIDAR', actualizado_en: new Date() },
        });

        await tx.inscripciones.updateMany({
          where: { alumno_id: deuda.alumno_id, estado: 'PENDIENTE_PAGO' },
          data: { estado: 'POR_VALIDAR', actualizado_en: new Date() },
        });

        // 3. Buscamos o creamos el pago (Blindaje contra duplicados de webhooks de MP)
        let pago = await tx.pagos.findFirst({ 
          where: { cuenta_id: deuda_id, codigo_operacion: paymentId } 
        });

        if (!pago) {
          const metodoPago = await tx.metodos_pago.findFirst({ where: { nombre: 'MERCADO PAGO' } });
          
          pago = await tx.pagos.create({
            data: {
              cuenta_id: deuda_id,
              metodo_pago_id: metodoPago ? metodoPago.id : 1, 
              monto_pagado: parseFloat(transaction_amount),
              estado_validacion: 'PENDIENTE', // Inicia pendiente para que validarPago lo procese correctamente
              codigo_operacion: paymentId,
              fecha_pago: new Date()
            }
          });
        }

        // 4. Invocamos de inmediato la lógica maestra de validación (Alcancía, estados, activación y clases)
        // Pasamos el objeto de transacción 'tx' si tu pagosService lo soporta, o dejamos que corra de forma regular.
        // Como 'validarPago' maneja su propia transacción interna, ejecutamos la llamada directa:
        const resultado = await pagosService.validarPago({
          pago_id: pago.id,
          accion: 'APROBAR',
          usuario_admin_id: 1, // ID del Bot/Sistema de automatización
          notas: 'Validación automática y generación de ciclos vía Mercado Pago Webhook.'
        });

        console.log(`🚀 [AUTOMATIZACIÓN COMPLETADA] Ciclo activo y clases generadas para deuda ${deuda_id}`);
        return { success: true, deuda_id };
      });
    }
    
    return { success: false };
  }
};