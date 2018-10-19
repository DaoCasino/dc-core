import NodeRsa from "node-rsa"


export interface IRsa {
  getNE: () => { n: string; e: number }
  setNE: (n: string, e: number) => { n: string; e: number }
 
  sign: (string) => string
  
  verify: (msg:string, sign:string) => boolean
}


export class Rsa implements IRsa {
  private _key: 'string'
  public instance: NodeRsa

  constructor(params: any = {}) {
    this._key = params.key || 'components-public'
    this.instance = new NodeRsa(params)

    if (params.genKeyPair) this.instance.generateKeyPair()
  }

  getNE(): { n: string; e: number } {
      const  { n , e } = this.instance.exportKey(this._key)

      return { 
        n : n.toString('hex'),
        e
      } 
  }

  setNE(n: string, e: number){
    return this.instance.importKey({ n: Buffer.from(n, 'hex'), e }, this._key)
  }

  sign(msg:string): string  {
    return this.instance.encryptPrivate(
      Buffer.from(msg, 'utf8')
    ).toString('hex')
  }

  verify(msg:string, sign:string): boolean {
    const decryptedMsg = this.instance.decryptPublic(
              Buffer.from( sign , 'hex')
          ).toString('utf8')

    return msg === decryptedMsg
  }
}