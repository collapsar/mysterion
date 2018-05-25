/*
 * Copyright (C) 2017 The "MysteriumNetwork/mysterion" Authors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// @flow
import type from '../types'

import messages from '../../../app/messages'
import {FunctionLooper} from '../../../libraries/functionLooper'
import config from '@/config'
import {ConnectEventTracker, currentUserTime} from '../../../app/statistics/events-connection'
import RendererCommunication from '../../../app/communication/renderer-communication'
import {EventCollector as StatsCollector} from '../../../app/statistics/events'
import type {EventFactory as StatsEventsFactory} from '../../../app/statistics/events'
import type {TequilapiClient} from '../../../libraries/mysterium-tequilapi/client'
import type {ConnectionStatus} from '../../../libraries/mysterium-tequilapi/dto/connection-status-enum'
import ConnectionStatusEnum from '../../../libraries/mysterium-tequilapi/dto/connection-status-enum'
import ConnectionStatisticsDTO from '../../../libraries/mysterium-tequilapi/dto/connection-statistics'
import ConnectionRequestDTO from '../../../libraries/mysterium-tequilapi/dto/connection-request'
import type {BugReporter} from '../../../app/bug-reporting/interface'
import {isServiceUnavailableError, isTimeoutError, isRequestClosedError} from '../../../libraries/mysterium-tequilapi/client-error'
import logger from '../../../app/logger'

type ConnectionStore = {
  ip: ?string,
  status: ConnectionStatus,
  statistics: Object,
  actionLoopers: { [string]: FunctionLooper }
}

class ActionLooper {
  action: string
  looper: FunctionLooper

  constructor (action: string, looper: FunctionLooper) {
    this.action = action
    this.looper = looper
  }
}

class ActionLooperConfig {
  action: string
  threshold: number

  constructor (action: string, threshold: number) {
    this.action = action
    this.threshold = threshold
  }
}

const defaultStatistics = {
}

const state: ConnectionStore = {
  ip: null,
  status: ConnectionStatusEnum.NOT_CONNECTED,
  statistics: defaultStatistics,
  actionLoopers: {}
}

const getters = {
  status (state: ConnectionStore): ConnectionStatus {
    return state.status
  },
  connection (state: ConnectionStore): ConnectionStore {
    return state
  },
  ip (state: ConnectionStore): ?string {
    return state.ip
  }
}

const mutations = {
  [type.SET_CONNECTION_STATUS] (state: ConnectionStore, status: ConnectionStatus) {
    state.status = status
  },
  [type.CONNECTION_STATISTICS] (state: ConnectionStore, statistics: ConnectionStatisticsDTO) {
    state.statistics = statistics
  },
  [type.CONNECTION_IP] (state: ConnectionStore, ip: string) {
    state.ip = ip
  },
  [type.CONNECTION_STATISTICS_RESET] (state: ConnectionStore) {
    state.statistics = defaultStatistics
  },
  [type.SET_ACTION_LOOPER] (state: ConnectionStore, looper: ActionLooper) {
    state.actionLoopers[looper.action] = looper.looper
  },
  [type.REMOVE_ACTION_LOOPER] (state: ConnectionStore, action: string) {
    delete state.actionLoopers[action]
  }
}

function actionsFactory (
  tequilapi: TequilapiClient,
  rendererCommunication: RendererCommunication,
  statsCollector: StatsCollector,
  statsEventsFactory: StatsEventsFactory,
  bugReporter: BugReporter
) {
  return {
    async [type.CONNECTION_IP] ({commit}) {
      try {
        const ipModel = await tequilapi.connectionIP(config.ipUpdateTimeout)
        commit(type.CONNECTION_IP, ipModel.ip)
      } catch (err) {
        if (isTimeoutError(err) || isServiceUnavailableError(err)) {
          return
        }
        bugReporter.captureException(err)
      }
    },
    [type.START_ACTION_LOOPING] ({dispatch, commit, state}, event: ActionLooperConfig): FunctionLooper {
      const currentLooper = state.actionLoopers[event.action]
      if (currentLooper) {
        logger.info('Warning: requested to start looping action which is already looping: ' + event.action)
        return currentLooper
      }

      const looper = new FunctionLooper(() => dispatch(event.action), event.threshold)
      looper.start()

      commit(type.SET_ACTION_LOOPER, new ActionLooper(event.action, looper))
      return looper
    },
    async [type.STOP_ACTION_LOOPING] ({commit, state}, action: string) {
      const looper = state.actionLoopers[action]
      if (looper) {
        await looper.stop()
      }
      commit(type.REMOVE_ACTION_LOOPER, action)
    },
    async [type.FETCH_CONNECTION_STATUS] ({commit, dispatch}) {
      try {
        const statusModel = await tequilapi.connectionStatus()
        await dispatch(type.SET_CONNECTION_STATUS, statusModel.status)
      } catch (err) {
        commit(type.SHOW_ERROR, err)
      }
    },
    async [type.SET_CONNECTION_STATUS] ({commit, dispatch, state}, newStatus: ConnectionStatus) {
      const oldStatus = state.status
      if (oldStatus === newStatus) {
        return
      }
      commit(type.SET_CONNECTION_STATUS, newStatus)
      rendererCommunication.sendConnectionStatusChange({oldStatus, newStatus})

      if (newStatus === ConnectionStatusEnum.CONNECTED) {
        await dispatch(type.START_ACTION_LOOPING, new ActionLooperConfig(type.CONNECTION_STATISTICS, config.statisticsUpdateThreshold))
      }
      if (oldStatus === ConnectionStatusEnum.CONNECTED) {
        await dispatch(type.STOP_ACTION_LOOPING, type.CONNECTION_STATISTICS)
      }
    },
    async [type.CONNECTION_STATISTICS] ({commit}) {
      try {
        const statistics = await tequilapi.connectionStatistics()
        commit(type.CONNECTION_STATISTICS, statistics)
      } catch (err) {
        commit(type.SHOW_ERROR, err)
      }
    },
    async [type.CONNECT] ({commit, dispatch, state}, connectionRequest: ConnectionRequestDTO) {
      let eventTracker = new ConnectEventTracker(statsCollector, currentUserTime, statsEventsFactory)
      eventTracker.connectStarted({
        consumerId: connectionRequest.consumerId,
        providerId: connectionRequest.providerId
      })

      const looper = state.actionLoopers[type.FETCH_CONNECTION_STATUS]
      if (looper) {
        await looper.stop()
      }

      await dispatch(type.SET_CONNECTION_STATUS, ConnectionStatusEnum.CONNECTING)
      commit(type.CONNECTION_STATISTICS_RESET)

      try {
        await tequilapi.connectionCreate(connectionRequest)
        eventTracker.connectEnded()
        commit(type.HIDE_ERROR)
      } catch (err) {
        if (isRequestClosedError(err)) {
          eventTracker.connectCanceled()
          return
        }

        commit(type.SHOW_ERROR_MESSAGE, messages.connectFailed)
        const error: Object = new Error('Connection to node failed.')
        error.original = err
        eventTracker.connectEnded(error.toString())
        bugReporter.captureInfoException(err)
      } finally {
        if (looper) {
          looper.start()
        }
      }
    },
    async [type.DISCONNECT] ({commit, dispatch}) {
      const looper = state.actionLoopers[type.FETCH_CONNECTION_STATUS]
      if (looper) {
        await looper.stop()
      }

      try {
        await dispatch(type.SET_CONNECTION_STATUS, ConnectionStatusEnum.DISCONNECTING)

        try {
          await tequilapi.connectionCancel()
        } catch (err) {
          commit(type.SHOW_ERROR, err)
          console.log('Connection cancelling failed:', err)
          bugReporter.captureInfoException(err)
        }
        dispatch(type.FETCH_CONNECTION_STATUS)
        dispatch(type.CONNECTION_IP)
      } catch (err) {
        commit(type.SHOW_ERROR, err)
        throw (err)
      } finally {
        if (looper) {
          looper.start()
        }
      }
    }
  }
}

function factory (actions: Object) {
  return {
    state,
    getters,
    mutations,
    actions
  }
}

export {
  ActionLooper,
  ActionLooperConfig,
  state,
  mutations,
  getters,
  actionsFactory
}
export default factory
