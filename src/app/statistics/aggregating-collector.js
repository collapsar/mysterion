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
import { EventCollector } from './events'
import type { Event } from './events'

class AggregatingCollector implements EventCollector {
  _events: Array<Event>
  _delegate: EventCollector
  _accumulatorSize: number
  _flushTimeout: number
  _timeoutHandle: TimeoutID

  constructor (delegate: EventCollector, accumulatorSize: number, flushTimeoutInSeconds: number = 10) {
    this._events = []
    this._delegate = delegate
    this._accumulatorSize = accumulatorSize
    this._flushTimeout = flushTimeoutInSeconds
  }

  async collectEvents (...events: Array<Event>): Promise<void> {
    clearTimeout(this._timeoutHandle)
    this._events.push(...events)
    if (this._events.length < this._accumulatorSize) {
      this._setupFlushAfterTime()
      return Promise.resolve()
    }
    await this._sendEventsToDelegate()
  }

  _setupFlushAfterTime (): void {
    this._timeoutHandle = setTimeout(() => this._sendEventsToDelegate(), this._flushTimeout * 1000)
  }

  async _sendEventsToDelegate (): Promise<any> {
    let eventsToSend = this._events.splice(0, this._accumulatorSize)
    return this._delegate.collectEvents(...eventsToSend)
  }
}

export default AggregatingCollector
