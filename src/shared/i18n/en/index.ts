// All the texts of the interface in this language.

import { common } from './common'
import { app } from './app'
import { library } from './library'
import { editor } from './editor'
import { chat } from './chat'
import { plan } from './plan'
import { settings } from './settings'
import { exportDialog } from './exportDialog'
import { write } from './write'
import { history } from './history'
import { onboarding } from './onboarding'
import { main } from './main'

export const messages = { common, app, library, editor, chat, plan, settings, exportDialog, write, history, onboarding, main }

export type Messages = typeof messages
