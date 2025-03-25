import { rest } from 'msw'
import { Address } from '@ton/core'

export const createJetton = rest.post('/api/create-jetton', async (request) => {
  try {
    const { address, amount } = await request.json()
    
    if (!address || !amount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Validate address
    try {
      Address.parse(address)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Mock response
    return new Response(JSON.stringify({
      success: true,
      message: 'Jetton created successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
