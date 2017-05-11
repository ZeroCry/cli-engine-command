// @flow

import type Command from './command'
import {type Arg} from './arg'
import {type Flag} from './flags'
import {stdtermwidth} from './output/screen'
import {type Config} from 'cli-engine-config'

function linewrap (length: number, s: string): string {
  const linewrap = require('./output/linewrap')
  return linewrap(length, stdtermwidth, {
    skipScheme: 'ansi-color'
  })(s).trim()
}

function renderList (items: [string, ?string][]): string {
  const S = require('string')
  const max = require('lodash.maxby')

  let maxLength = max(items, '[0].length')[0].length + 1
  let lines = items
    .map(i => {
      let left = ` ${i[0]}`
      let right = i[1]
      if (!right) return left
      left = `${S(left).padRight(maxLength)}`
      right = linewrap(maxLength + 4, right)
      return `${left} # ${right}`
    })
  return lines.join('\n')
}

function buildUsage (command: Class<Command<*>>): string {
  if (command.usage) return command.usage.trim()
  let cmd = command.command ? `${command.topic}:${command.command}` : command.topic
  if (!command.args) return cmd.trim()
  let args = command.args.map(renderArg)
  return `${cmd} ${args.join(' ')}`.trim()
}

function renderArg (arg: Arg): string {
  let name = arg.name.toUpperCase()
  if (arg.required !== false && arg.optional !== true) return `${name}`
  else return `[${name}]`
}

function renderFlags (flags: [string, Flag<*>][]): string {
  flags.sort((a, b) => {
    if (a[1].char && !b[1].char) return -1
    if (b[1].char && !a[1].char) return 1
    if (a[0] < b[0]) return -1
    return b[0] < a[0] ? 1 : 0
  })
  return renderList(flags.map(([name, f]) => {
    let label = []
    if (f.char) label.push(`-${f.char}`)
    if (name) label.push(` --${name}`)
    let usage = f.hasValue ? ` ${name.toUpperCase()}` : ''
    let description = f.description || ''
    if (f.required || f.optional === false) description = `(required) ${description}`
    return [label.join(',').trim() + usage, description]
  }))
}

export default class Help {
  config: Config
  constructor (config: Config) {
    this.config = config
  }

  command (cmd: Class<Command<*>>): string {
    let usage = `Usage: ${this.config.bin} ${buildUsage(cmd)}\n`
    let flags = Object.keys(cmd.flags || {}).map(f => [f, cmd.flags[f]]).filter(f => !f[1].hidden)
    return [usage,
      cmd.description ? `${cmd.description.trim()}\n` : '',
      flags.length ? `${renderFlags(flags)}\n` : '',
      cmd.help ? `${cmd.help.trim()}\n` : ''
    ].join('')
  }

  commandLine (cmd: Class<Command<*>>): [string, ?string] {
    return [buildUsage(cmd), cmd.description]
  }
}