// @flow

import {type BooleanFlag, type OptionFlag, type Arg} from 'cli-engine-config'
import type Command from './command'

export type InputFlags = {[name: string]: BooleanFlag | OptionFlag<*>}
export type Input = {
  flags: InputFlags,
  args: Arg[],
  variableArgs: boolean,
  cmd?: Command<any>
}

export type OutputFlags = {[name: string]: any}
export type OutputArgs = {[name: string]: string}

export type Output = {
  flags: OutputFlags,
  argv: Array<*>,
  args: {[name: string]: string}
}

export default class Parse {
  input: Input
  constructor (input: $Shape<Input>) {
    this.input = input
    input.args = input.args || []
    input.flags = input.flags || {}
  }

  async parse (output: $Shape<Output> = {}) {
    let argv = (output.argv || [])
    output.flags = output.flags || {}
    output.argv = []
    output.args = {}

    let parseFlag = arg => {
      let long = arg.startsWith('--')
      let name = long ? findLongFlag(arg) : findShortFlag(arg)
      if (!name) {
        const i = arg.indexOf('=')
        if (i !== -1) {
          let sliced = arg.slice(i + 1)
          argv.unshift(sliced)

          let equalsParsed = parseFlag(arg.slice(0, i))
          if (!equalsParsed) {
            argv.shift()
          }
          return equalsParsed
        }
        return false
      }
      let flag = this.input.flags[name]
      let cur = output.flags[name]
      if (flag.parse) {
        // TODO: handle multiple flags
        if (cur) throw new Error(`Flag --${name} already provided`)
        let input
        if (long || arg.length < 3) input = argv.shift()
        else input = arg.slice(arg[2] === '=' ? 3 : 2)
        if (!input) throw new Error(`Flag --${name} expects a value`)
        output.flags[name] = input
      } else {
        if (!cur) output.flags[name] = true
        // push the rest of the short characters back on the stack
        if (!long && arg.length > 2) argv.unshift(`-${arg.slice(2)}`)
      }
      return true
    }

    let findLongFlag = arg => {
      let name = arg.slice(2)
      if (this.input.flags[name]) return name
    }

    let findShortFlag = arg => {
      for (let k of Object.keys(this.input.flags)) {
        if (this.input.flags[k].char === arg[1]) return k
      }
    }

    let parsingFlags = true
    let maxArgs = this.input.args.length
    let minArgs = this.input.args.filter(a => a.required !== false && !a.optional).length
    while (argv.length) {
      let arg = argv.shift()
      if (parsingFlags && arg.startsWith('-')) {
        // attempt to parse as flag
        if (arg === '--') { parsingFlags = false; continue }
        if (parseFlag(arg)) continue
        // not actually a flag if it reaches here so parse as an arg
      }
      // not a flag, parse as arg
      let argDefinition = this.input.args[output.argv.length]
      if (argDefinition) output.args[argDefinition.name] = arg
      output.argv.push(arg)
    }

    if (!this.input.variableArgs && output.argv.length > maxArgs) throw new Error(`Unexpected argument ${output.argv[maxArgs]}`)
    if (output.argv.length < minArgs) throw new Error(new Error(`Missing required argument ${this.input.args[output.argv.length].name}`))

    for (let name of Object.keys(this.input.flags)) {
      const flag = this.input.flags[name]
      if (flag.parse) {
        output.flags[name] = await flag.parse(output.flags[name], this.input.cmd, name)
        flag.required = flag.required || flag.optional === false
        if (flag.required && !output.flags[name]) throw new RequiredFlagError(name)
      }
    }

    return output
  }
}

export class RequiredFlagError extends Error {
  constructor (name: string) {
    super(`Missing required flag --${name}`)
  }
}
