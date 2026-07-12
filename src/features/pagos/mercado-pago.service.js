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
      
      // 📦 PARTE 1: Guardamos en la base de datos (Transacción 1)
      const pagoCreado = await prisma.$transaction(async (tx) => {
        
        const deuda = await tx.cuentas_por_cobrar.findUnique({
          where: { id: deuda_id }
        });

        if (!deuda) throw new Error(`Deuda no encontrada: ${deuda_id}`);

        // Escudo protector: Pasar a POR_VALIDAR
        await tx.cuentas_por_cobrar.update({
          where: { id: deuda_id },
          data: { estado: 'POR_VALIDAR', actualizado_en: new Date() },
        });

        await tx.inscripciones.updateMany({
          where: { alumno_id: deuda.alumno_id, estado: 'PENDIENTE_PAGO' },
          data: { estado: 'POR_VALIDAR', actualizado_en: new Date() },
        });

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
              estado_validacion: 'PENDIENTE', 
              codigo_operacion: paymentId,
              fecha_pago: new Date()
            }
          });
        }
        // Retornamos el pago para usarlo fuera de la transacción
        return pago; 
      }); 
      // 🛑 AQUÍ TERMINA LA TRANSACCIÓN 1. El pago ya es visible para toda la base de datos.

      // 🚀 PARTE 2: Ejecutamos tu lógica maestra (que abrirá su propia Transacción 2)
      const resultado = await pagosService.validarPago({
        pago_id: pagoCreado.id,
        accion: 'APROBAR',
        usuario_admin_id: 1, 
        notas: 'Validación automática y generación de ciclos vía Mercado Pago Webhook.'
      });

      console.log(`🚀 [AUTOMATIZACIÓN COMPLETADA] Ciclo activo y clases generadas para deuda ${deuda_id}`);
      return { success: true, deuda_id };
    }
    
    return { success: false };
  }
};