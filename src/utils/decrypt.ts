const PASSPHRASE = 'Koltera 2 Playtest Save Encryption Key v1'

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(PASSPHRASE))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-CBC' }, false, ['decrypt'])
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

export async function decryptSave(fileContents: string): Promise<object> {
  const trimmed = fileContents.trim()

  const parts = trimmed.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid save file format')
  }

  const iv = hexToBytes(parts[0])
  const ciphertext = hexToBytes(parts[1])
  const key = await deriveKey()

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  )
  const json = new TextDecoder().decode(decrypted)
  return JSON.parse(json)
}
