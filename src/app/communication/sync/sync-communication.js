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

import type { SerializedLogCaches } from '../../logging/log-cache-bundle'
import type { LogDTO } from '../dto'
import type { RavenData } from '../../bug-reporting/bug-reporter-metrics'

interface SyncMainCommunication {
  onGetSerializedCaches (callback: () => SerializedLogCaches): void,
  onGetMetrics (callback: () => RavenData): void,
  onLog (callback: () => void): void
}

interface SyncRendererCommunication {
  getSerializedCaches (): ?SerializedLogCaches,
  getMetrics (): RavenData,
  sendLog (dto: LogDTO): void
}

export type { SyncMainCommunication, SyncRendererCommunication }
