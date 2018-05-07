import type from '../types'
import {setUser as bugReporterSetUser} from '../../../app/bugReporting/bug-reporter-renderer'
import RendererMessageBus from '../../../app/communication/rendererMessageBus'
import RendererCommunication from '../../../app/communication/renderer-communication'

const state = {
  current: null,
  unlocked: false
}

const mutations = {
  [type.IDENTITY_GET_SUCCESS] (state, identity) {
    state.current = identity // { id: '0xC001FACE00000123' }
    bugReporterSetUser(identity)
    const messageBus = new RendererMessageBus()
    const communication = new RendererCommunication(messageBus)
    communication.sendCurrentIdentityChange(identity)
  },
  [type.IDENTITY_LIST_SUCCESS] (state, data) {
    state.identites = data
  },
  [type.IDENTITY_UNLOCK_SUCCESS] (state) {
    state.unlocked = true
  },
  [type.IDENTITY_UNLOCK_PENDING] (state) {
    state.unlocked = false
  },
  [type.IDENTITY_UNLOCK_FAIL] (state) {
    state.unlocked = false
  }
}

const getters = {
  currentIdentity (state) {
    return state.current.id
  }
}

const getPassword = async () => ''

function actionsFactory (tequilapi) {
  return {
    async [type.IDENTITY_CREATE] ({commit}) {
      try {
        return await tequilapi.identity.create(await getPassword())
      } catch (err) {
        commit(type.SHOW_ERROR, err)
        throw (err)
      }
    },
    async [type.IDENTITY_UNLOCK] ({commit}) {
      try {
        const res = await tequilapi.identity.unlock({
          id: state.current.id,
          passphrase: await getPassword()
        })
        commit(type.IDENTITY_UNLOCK_SUCCESS, res)
      } catch (err) {
        commit(type.SHOW_ERROR, err)
      }
    },
    async [type.IDENTITY_LIST] ({commit}) {
      try {
        const res = await tequilapi.identity.list()
        commit(type.IDENTITY_LIST_SUCCESS, res.identities)
        return res.identities
      } catch (err) {
        commit(type.SHOW_ERROR, err)
        throw (err)
      }
    }
  }
}

function factory (tequilapi) {
  return {
    state,
    getters,
    mutations,
    actions: actionsFactory(tequilapi)
  }
}

export {
  state,
  getters,
  mutations,
  actionsFactory
}
export default factory
