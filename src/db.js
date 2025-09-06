require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

// Verificar conexión
(async () => {
  try {
    // Hacemos un query mínimo para validar conexión
    const { data, error } = await supabase.from('llamadas').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Conexión a Supabase exitosa');
  } catch (err) {
    console.error('❌ Error conectando a Supabase:', err.message);
  }
})();

module.exports = { supabase };
