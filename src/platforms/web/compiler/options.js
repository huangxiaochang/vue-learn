/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

// 编译函数的options的基本配置项
export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,  // array， 包含三个项，klass, style, model
  directives,  // object 包含html,text, model是三个函数
  isPreTag, // function 判断是否那是pre标签
  isUnaryTag,  // function 判断给定的标签是否是一元标签
  mustUseProp,  // function 检测一个属性在标签中是否要使用props进行绑定
  canBeLeftOpenTag,  // function 检查哪些虽然不是一元标签，但是可以自己不全并闭合的标签，如p标签
  isReservedTag,  // function 检查给定的标签是否是保留的标签
  getTagNamespace,  // function 获取标签的命名空间
  staticKeys: genStaticKeys(modules) // 根据编译项modules生成一个静态键字符串
}
