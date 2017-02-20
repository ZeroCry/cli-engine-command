// @flow
/* globals
   Class
 */

const slack = Symbol('slack')
const stdout = Symbol('stdout')
const stderr = Symbol('stderr')
const util = require('util')
const linewrap = require('./linewrap')

import {errtermwidth} from './screen'
import type {Config} from './base'

function epipe (fn) {
  try {
    fn()
  } catch (err) {
    if (err !== 'EPIPE') throw err
  }
}

function wrap (msg) {
  return linewrap(6,
    errtermwidth, {
      skipScheme: 'ansi-color',
      skip: /^\$ .*$/
    })(msg || '')
}

function bangify (msg, c) {
  let lines = msg.split('\n')
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    lines[i] = ' ' + c + line.substr(2, line.length)
  }
  return lines.join('\n')
}

function getErrorMessage (err) {
  if (err.body) {
    // API error
    if (err.body.message) {
      return err.body.message
    } else if (err.body.error) {
      return err.body.error
    }
  }
  // Unhandled error
  if (err.message && err.code) {
    return `${util.inspect(err.code)}: ${err.message}`
  } else if (err.message) {
    return err.message
  }
  return err
}

const arrow = process.platform === 'win32' ? '!' : '▸'

export default (Base: Class<any>) => class extends Base {
  constructor (config: Config) {
    super(config)
    if (config.mock) {
      this[stdout] = []
      this[stderr] = []
    }
    if (config.slack) this[slack] = []

    this.action = message => {
      if (this.action.task) {
        if (this.action.task.spinner) this.action.task.spinner.text = `${message}...`
        else process.stderr.write(`\n${message}...`)
      } else {
        this.action.task = {text: `${message}...`, command: this, spinner: null}
        if (this.displaySpinner) {
          const Spinner = require('./spinner')
          this.action.task.spinner = new Spinner(this.action.task)
          this.action.task.spinner.start()
        } else this.writeError(this.action.task.text)
      }
    }

    this.action.status = status => {
      if (!this.action.task) return
      if (this.action.task.spinner) this.action.task.spinner.status = status
      else process.stderr.write(` ${status}`)
    }

    this.action.done = (msg = 'done') => {
      if (!this.action.task) return
      this.action.status(msg)
      if (this.action.task.spinner) this.action.task.spinner.stop(msg)
      else process.stderr.write('\n')
      delete this.action.task
    }

    this.action.pause = fn => {
      if (this.action.task) {
        if (this.action.task.spinner) {
          this.action.task.spinner.stop()
          this.action.task.spinner.clear()
        } else {
          delete this.action.task
          process.stderr.write('\n')
        }
      }
      fn()
      if (this.action.task && this.action.task.spinner) {
        process.stderr.write('\n')
        this.action.task.spinner.start()
      }
    }
  }

  get displaySpinner (): boolean {
    return !this[slack] && !!process.stdin.isTTY && !!process.stderr.isTTY && !process.env.CI && process.env.TERM !== 'dumb'
  }

  get stdout (): string[] {
    return this[stdout].join('\n')
  }

  get stderr (): string[] {
    return this[stderr].join('\n')
  }

  async done () {
    if (super.done) super.done()
    this.showCursor()
    this.action.done()
    if (this[slack]) {
      const slack = require('./slack')
      slack.respond({
        text: `\`/heroku ${this[slack].join('\n')}\``,
        attachments: [
          {
            text: '```' + this[slack].join('\n') + '```',
            mrkdwn_in: ['text']
          }
        ]
      }, this[slack].join('\n'))
    }
  }

  log (data, ...args: any) {
    epipe(() => {
      this.action.pause(() => {
        if (this[stdout]) this[stdout].push(util.format(data, ...args))
        else if (this[slack]) this[slack].push(util.format(data, ...args))
        else if (arguments.length === 0) console.log()
        else console.log(data, ...args)
      })
    })
  }

  write (msg: string) {
    epipe(() => {
      if (this[slack]) this[slack].push(msg)
      else process.stdout.write(msg)
    })
  }

  writeError (msg: string) {
    epipe(() => {
      if (this[slack]) this[slack].push(msg)
      else process.stderr.write(msg)
    })
  }

  styledJSON (obj: any) {
    let json = JSON.stringify(obj, null, 2)
    if (this.supportsColor) {
      let cardinal = require('cardinal')
      let theme = require('cardinal/themes/jq')
      this.log(cardinal.highlight(json, {json: true, theme: theme}))
    } else {
      this.log(json)
    }
  }

  styledHeader (header: string) {
    this.log(this.color.gray('=== ') + this.color.bold(header))
  }

  styledObject (obj: any, keys: string[]) {
    const util = require('util')
    let keyLengths = Object.keys(obj).map(key => key.toString().length)
    let maxKeyLength = Math.max.apply(Math, keyLengths) + 2
    function pp (obj) {
      if (typeof obj === 'string' || typeof obj === 'number') {
        return obj
      } else if (typeof obj === 'object') {
        return Object.keys(obj).map(k => k + ': ' + util.inspect(obj[k])).join(', ')
      } else {
        return util.inspect(obj)
      }
    }
    let logKeyValue = (key, value) => {
      this.log(`${key}:` + ' '.repeat(maxKeyLength - key.length - 1) + pp(value))
    }
    for (var key of (keys || Object.keys(obj).sort())) {
      let value = obj[key]
      if (Array.isArray(value)) {
        if (value.length > 0) {
          logKeyValue(key, value[0])
          for (var e of value.slice(1)) {
            this.log(' '.repeat(maxKeyLength) + pp(e))
          }
        }
      } else if (value !== null && value !== undefined) {
        logKeyValue(key, value)
      }
    }
  }

  /**
   * inspect an object for debugging
   */
  i (obj: any) {
    this.action.pause(() => console.dir(obj, {colors: true}))
  }

  debug (obj: string) {
    if (this.debugging) this.action.pause(() => console.log(obj))
  }

  error (err: Error | string) {
    epipe(() => {
      if (typeof err === 'string') {
        this.action.pause(() => {
          if (this[stderr]) this[stderr].push(err)
          else if (this[slack]) this[slack].push(err)
          else console.error(err)
        })
      } else {
        if (this.action.task) this.action.done(this.color.bold.red('!'))
        if (this.debugging) console.error(err.stack)
        else console.error(bangify(wrap(getErrorMessage(err)), this.color.red(arrow)))
      }
    })
  }

  warn (message: Error | string) {
    epipe(() => {
      this.action.pause(() => {
        if (this.debugging) console.trace(`WARNING: ${util.inspect(message)}`)
        else console.error(bangify(wrap(message), this.color.yellow(arrow)))
      })
    })
  }

  showCursor () {
    const ansi = require('ansi-escapes')
    if (process.stderr.isTTY) process.stderr.write(ansi.cursorShow)
  }
}