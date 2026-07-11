import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { prisma } from '../../config/database.config.js';
import { pagosService } from '../pagos/pagos.service.js'; // IMPORTANTE: Importar tu servicio de pagos

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
    // 🔥 Corrección: Instanciar Payment con el client
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: paymentId });
    const { status, external_reference, transaction_amount } = paymentInfo;

    if (status === 'approved') {
      const deuda_id = parseInt(external_reference);
      
      // Buscamos si ya procesamos este pago
      let pago = await prisma.pagos.findFirst({ 
        where: { cuenta_id: deuda_id, codigo_operacion: paymentId } 
      });

      if (!pago) {
        // Asegúrate de definir o buscar el ID del método 'MERCADO PAGO' en tu DB
        const metodoPago = await prisma.metodos_pago.findFirst({ where: { nombre: 'MERCADO PAGO' } });
        
        pago = await prisma.pagos.create({
          data: {
            cuenta_id: deuda_id,
            metodo_pago_id: metodoPago ? metodoPago.id : 1, // Fallback a 1 si no encuentra
            monto_pagado: transaction_amount,
            estado_validacion: 'PENDIENTE',
            codigo_operacion: paymentId,
            fecha_pago: new Date()
          }
        });
      }

      // 🔄 Llamamos a tu lógica maestra de validación
      const resultado = await pagosService.validarPago({
        pago_id: pago.id,
        accion: 'APROBAR',
        usuario_admin_id: 1, // Usuario sistema/bot
        notas: 'Validación automática vía Mercado Pago'
      });

      return { success: true, deuda_id };
    }
    return { success: false };
  }
};