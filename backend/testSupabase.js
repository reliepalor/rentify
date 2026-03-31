import supabase from './config/supabase.js'

async function testConnection() {
  const { data, error } = await supabase
    .from('users')
    .select('*')

  if (error) {
    console.error('❌ Error:', error.message)
  } else {
    console.log('✅ Data:', data)
  }
}

testConnection()