import NodeRSA from 'node-rsa'
import { Rsa } from '../rsa'

console.log(`
======================
    node-rsa check
======================
`)
;(function(){
    console.info(' >> Create player/client and dealer/bankroller RSA instances')
    const dealer = new NodeRSA()
    const player = new NodeRSA()

    console.info(' >> dealer generate key pair')
    dealer.generateKeyPair()

    console.info('export dealer public keys:')
    const dealerPublic = dealer.exportKey('components-public')

    console.log('import N, E to player instance')
    const importRes = player.importKey({n:dealerPublic.n, e:dealerPublic.e}, 'components-public')

    console.log('encrypt msg by dealer')
    const msg = 'some_data_' + Math.random()*1000000000
    const msgB = Buffer.from(msg, 'utf8')
    const encM = dealer.encryptPrivate( msg )


    console.log('dencrypt encM by player')
    const decM = player.decryptPublic(encM)

    console.table({
        N: dealerPublic.n.toString('hex').substr(0, 10)+'...',
        E: dealerPublic.e, 
        msg : msgB.toString('hex').substr(0, 10)+'...',
        encryptedMsg  : encM.toString('hex').substr(0, 10)+'...',
        dencryptedMsg : decM.toString('hex').substr(0, 10)+'...',
    })

    if(decM.toString('hex') !== msgB.toString('hex')){
        throw new Error('Incorrect RSA verify ')
    }

    console.log(' ✔️  node-rsa - success!')
})()








console.log(`


`)
console.log(`
======================
    rsa.ts check
======================
`)
;(function(){
    console.info(' >> Create player/client and dealer/bankroller RSA instances')
    const dealer = new Rsa({genKeyPair:true})
    const player = new Rsa()


    console.info('export dealer public keys:')
    const {n, e} = dealer.getNE()

    console.log('import N, E to player instance')
    const importRes = player.setNE(n,e)

    const msg = 'some_data_' + Math.random()*1000000000
    console.log('encrypt msg by dealer:', msg)
    const sign = dealer.sign( msg )

    console.log('verify msg by player')
    const verify = player.verify(msg, sign)

    console.table({
        N: n.substr(0, 10)+'...',
        E: e, 
        msg    : msg.substr(0, 10)+'...',
        sign   : sign.substr(0, 10)+'...',
        verify : verify,
    })

    if(!verify){
        throw new Error('Incorrect RSA verify ')
    }
   
    console.log(' ✔️  rsa - success!')
}())


