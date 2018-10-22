/*
 * Full random object
 */
export interface Rnd {
  // options for random numbers
  // ex.: [[0,10],[50,100]] - get 2 random numbers,
  // first from 0 to 10, and second from 50 to 100
  opts: number[][] // num generate options
  hash: string // hash from rnd args
  sig: string // RSA signed @hash
  res: string // sha3 hash of @sig
}
