import MainCommunication from '../../../../src/app/communication/main-communication'
import messages from '../../../../src/app/communication/index'
import FakeMessageBus from '../../../helpers/fakeMessageBus'

describe('MainCommunication', () => {
  let fakeMessageBus
  let communication

  beforeEach(() => {
    fakeMessageBus = new FakeMessageBus()
    communication = new MainCommunication(fakeMessageBus)
  })

  describe('sendMysteriumClientLog', () => {
    it('sends message to bus', () => {
      const data = { level: 'INFO', data: 'Test log' }
      communication.sendMysteriumClientLog(data)

      expect(fakeMessageBus.lastChannel).to.eql(messages.MYSTERIUM_CLIENT_LOG)
      expect(fakeMessageBus.lastData).to.eql(data)
    })
  })

  describe('onConnectionStatusChange', () => {
    it('receives message from bus', () => {
      let callbackData = null
      communication.onConnectionStatusChange((data) => {
        callbackData = data
      })

      const data = { oldStatus: 'old', newStatus: 'new' }
      fakeMessageBus.triggerOn(messages.CONNECTION_STATUS_CHANGED, data)

      expect(callbackData).to.eql(data)
    })
  })
})