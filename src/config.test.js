// @flow
/* globals
   describe
   test
   expect
*/

import Config from './config'
import format from 'pretty-format'
import os from 'os'
import path from 'path'
import pjson from '../package.json'

const config = new Config({argv: ['heroku', 'apps']})

describe('inspect', () => {
  test('prints the object', () => {
    expect(format(config)).toMatch(/^Object {/)
  })
})

test('sets version from options', () => {
  const config = new Config({version: '1.0.0-foobar'})
  expect(config.version).toEqual('1.0.0-foobar')
})

test('props are set', () => {
  expect(config.name).toEqual('cli-engine-command')
  expect(config.version).toEqual(pjson.version)
  expect(config.channel).toEqual('stable')
  expect(config.argv).toEqual(['heroku', 'apps'])
  expect(config.mock).toEqual(false)
  expect(config.updateDisabled).toEqual(undefined)
  expect(config.bin).toEqual('cli-engine-command')
  expect(config.binPath).toEqual(undefined)
  expect(config.root).toEqual(path.join(__dirname, '..'))
  expect(config.defaultCommand).toEqual('help')
  expect(config.s3).toEqual({})
  expect(config._cli).toEqual({})
  expect(config.windows).toEqual(os.platform === 'win32')
})
