# Changelog

## [2.0.0](https://github.com/DanielAmenou/create-request/compare/create-request-v1.5.0...create-request-v2.0.0) (2025-11-29)


### ⚠ BREAKING CHANGES

* ResponseWrapper body methods can only be called once per response, matching native Fetch API behavior.

### ✨ Features

* add API builder for creating configured request instances ([8b66ed1](https://github.com/DanielAmenou/create-request/commit/8b66ed10e6795a449a422fffa6e74fafe86aa3b8))
* add configurable retry delay support to withRetries() ([8129483](https://github.com/DanielAmenou/create-request/commit/812948322e28a4e9807835a0d4ab84639e5b4b0f))
* add getArrayBuffer method to BaseRequest ([d931aa1](https://github.com/DanielAmenou/create-request/commit/d931aa116e072996efe8fd3ed92a92dd59066851))
* add GraphQL error handling with throwOnError option ([e57d445](https://github.com/DanielAmenou/create-request/commit/e57d44522b3741f42a186f84b0886af06c733b5c))
* **apiBuilder:** add query params support and improve docs ([7c64073](https://github.com/DanielAmenou/create-request/commit/7c6407329b4b96f32a451f47360b56c0c7ded9e8))
* **error-handling:** add cause support to RequestError and preserve original error messages ([d4925cd](https://github.com/DanielAmenou/create-request/commit/d4925cd1d7fa4bd9b936c38709ecc85ec3ec79cc))
* export api and request factory functions as named exports ([69967f6](https://github.com/DanielAmenou/create-request/commit/69967f68ccf1fc94d6ddfe2717b98f6116f33acc))
* export request factory functions ([e6802ef](https://github.com/DanielAmenou/create-request/commit/e6802ef7f84bb800b0c1fd02de1aadb1b83cb6a2))
* **response-wrapper:** add caching for response body methods ([dce4ea9](https://github.com/DanielAmenou/create-request/commit/dce4ea966e582ce9b5ad45f67120be197c1d1aa5))


### 🐛 Bug Fixes

* align TypeScript target with Node 18+ and use standard BodyInit type ([8105798](https://github.com/DanielAmenou/create-request/commit/8105798497c1916a6c02d9a6d0182fd9e3aeee26))
* check if File is defined before using instanceof ([97ef151](https://github.com/DanielAmenou/create-request/commit/97ef1519e6bef470ac58b40dd89321d147c78232))
* export CacheMode enum from main entry point ([65884f8](https://github.com/DanielAmenou/create-request/commit/65884f84b47e24033f2ce7864b731665da94d4f7))
* format long assertion in ErrorHandling.test.ts to satisfy Prettier ([f64d82d](https://github.com/DanielAmenou/create-request/commit/f64d82dfaff79e0b45c0e8ced225a665aa0057b8))
* handle HTTP status 0 as network error instead of "HTTP 0" ([b443cbc](https://github.com/DanielAmenou/create-request/commit/b443cbc7ec18f3bc126a1b54877b61f0115e7412))
* make path parameter optional in ApiBuilder HTTP methods ([b453373](https://github.com/DanielAmenou/create-request/commit/b4533737abb1a8f939a1d67a626400437c77dce7))
* preserve type information when chaining ApiBuilder methods ([c4df534](https://github.com/DanielAmenou/create-request/commit/c4df534189635b19fd5da68fdc9b80ed18bed2e5))
* prevent array mutation in response and error interceptors ([4e74f7f](https://github.com/DanielAmenou/create-request/commit/4e74f7f009f2fad59a07757d77dff969429ff8da))
* resolve linter errors and warnings ([86306f9](https://github.com/DanielAmenou/create-request/commit/86306f90adcf7cad1094026ebe561f2c7a1a8c62))
* **scripts:** push version commit along with tags in publish scripts ([90054ad](https://github.com/DanielAmenou/create-request/commit/90054adcc617f1a23df56b963f887fea45781e12))
* **test:** resolve TypeScript linter errors in test files ([251fc3d](https://github.com/DanielAmenou/create-request/commit/251fc3dd22e9aedfdc694b03ea6c6d1a81e7dd3b))
* update error messages ([57df51d](https://github.com/DanielAmenou/create-request/commit/57df51ddec34ea7b3ff4d1049de739b2696b4398))
* use glob package to resolve test file patterns in CI ([e5c5cce](https://github.com/DanielAmenou/create-request/commit/e5c5cce96b67d8af8cb0f3ee04713d9e0771b942))


### ⚡ Performance Improvements

* reduce bundle size ([16bfdf4](https://github.com/DanielAmenou/create-request/commit/16bfdf40774d4bc4521a492a9c3d7f7369abe842))
* shorten error messages to reduce bundle size ([b0336a3](https://github.com/DanielAmenou/create-request/commit/b0336a3cb200a1df23a31dde67b4069170069fbc))
* shorten error messages to reduce bundle size ([238b174](https://github.com/DanielAmenou/create-request/commit/238b174dd1ede09340343f55cd0421bfb64af167))
* shorten error messages to reduce bundle size ([35a872e](https://github.com/DanielAmenou/create-request/commit/35a872ea1d8e9cd9c3166fd0d8e272f158132ead))
* shorten error messages to reduce bundle size ([dfe9800](https://github.com/DanielAmenou/create-request/commit/dfe980055d668fda5685956a99fffb9e232233a0))


### 📝 Documentation

* add developer experience section comparing fluent API to object-based config ([acda768](https://github.com/DanielAmenou/create-request/commit/acda76832d9bc22d5422347e6cf49bafaedaf37a))
* add Instance Creation feature to comparison table ([b185bb6](https://github.com/DanielAmenou/create-request/commit/b185bb6d6a65df288fae6843f3176742134a5a0a))
* add JSDoc documentation for request configuration methods ([0f46302](https://github.com/DanielAmenou/create-request/commit/0f46302db9e60bc546684bf961ad060be32d519e))
* add mental model section to README ([306f195](https://github.com/DanielAmenou/create-request/commit/306f19587a7ecef2b5fb8a83eb3565ca7f69a30c))
* add Named Exports and Tree-Shaking Guide sections ([f7020c4](https://github.com/DanielAmenou/create-request/commit/f7020c463ed22875e5407c2a1236d12ac937c751))
* add SECURITY.md with vulnerability reporting policy ([53dbdcf](https://github.com/DanielAmenou/create-request/commit/53dbdcf677efc8551b2b68a1457d1c8b523f28d7))
* **contributing:** add package size impact reporting requirement ([2a26f8a](https://github.com/DanielAmenou/create-request/commit/2a26f8a79eb73aaeaeb3b7be148fc13459e0c886))
* fix JSDoc examples to use withBody() instead of withJson() ([6ba2c81](https://github.com/DanielAmenou/create-request/commit/6ba2c81888d4c817355ccf4b47a3f0084e644d0e))
* improve JSDoc for public APIs with enhanced IDE hints ([54b5df8](https://github.com/DanielAmenou/create-request/commit/54b5df816d52c0161526b3a710af3a5824a31447))
* **readme:** reorganize sections into Advanced Usage ([7b2292f](https://github.com/DanielAmenou/create-request/commit/7b2292f5349c5b5f66b0111d632a4869d737f58c))
* update package size ([8648e10](https://github.com/DanielAmenou/create-request/commit/8648e1052045e3d7644da61114e2eae466e5a984))
* update README with accurate bundle size and Node.js support ([ab850fc](https://github.com/DanielAmenou/create-request/commit/ab850fc5a40f401bc30d53b440e95994c137363a))


### ♻️ Code Refactoring

* **api-builder:** exclude query param methods from builder interface ([abb76b2](https://github.com/DanielAmenou/create-request/commit/abb76b27a0a737c2432d569847b55af96018de63))
* apiBuilder ([797c7ee](https://github.com/DanielAmenou/create-request/commit/797c7eedc1d8cdd5ea705a762e80adb87fbc2aed))
* **apiBuilder:** simplify URL resolution logic ([00fe6a6](https://github.com/DanielAmenou/create-request/commit/00fe6a67868dc64040e6070f1fb06e07e2e72404))
* **BaseRequest:** use withHeader instead of withHeaders for single headers ([8f6fc24](https://github.com/DanielAmenou/create-request/commit/8f6fc249102eafa82ae3bf579b72ef3b4f2dfaf2))
* reduce library size by shortening error messages ([55091f1](https://github.com/DanielAmenou/create-request/commit/55091f1a141e2dec0ae5b0adad1a3321d09d0ea9))
* remove response caching and add getArrayBuffer ([688481f](https://github.com/DanielAmenou/create-request/commit/688481fbdd83c6bcc1dd3e94f8090c000fc3e468))
* remove sizeUtils and related tests ([ededaa3](https://github.com/DanielAmenou/create-request/commit/ededaa3cfd02c06db803d44d1e3a82cbafb812ad))
* **RequestError:** make isTimeout and isAborted always boolean ([658cf8c](https://github.com/DanielAmenou/create-request/commit/658cf8cc7f690c456e6a7a93d447798f4143703a))
* **ResponseWrapper:** extract duplicate body consumption check into helper method ([af35853](https://github.com/DanielAmenou/create-request/commit/af358530e5025733530063d65e9f216182363183))
* simplify cookie handling and improve test coverage ([aff0ad6](https://github.com/DanielAmenou/create-request/commit/aff0ad69e5c51a7a5c1bf1b30c48e00e5c8b3291))
* simplify method implementations by delegating to base methods ([12fcb2e](https://github.com/DanielAmenou/create-request/commit/12fcb2ed2d2719ae9f53acec7dffec158ce81932))
* use shorter error messages ([a95c38e](https://github.com/DanielAmenou/create-request/commit/a95c38e7158b28e85289288a88259b93142ccd14))


### 🧪 Tests

* add body caching tests and update existing tests ([2ab20c8](https://github.com/DanielAmenou/create-request/commit/2ab20c884f20729ec888b99a9100581e27f41299))
* add comprehensive test coverage for edge cases ([24abff1](https://github.com/DanielAmenou/create-request/commit/24abff11bc3ab47e6dc952d368621d3d70bd9f42))
* improve coverage for BaseRequest edge cases and remove dead code ([9e97b0b](https://github.com/DanielAmenou/create-request/commit/9e97b0b85849d65397064301aa21f54dcfa7a5e4))


### 🔧 Build System

* add prepack script ([ea1849f](https://github.com/DanielAmenou/create-request/commit/ea1849f2dc922c406825cc70c8382a37957a6859))
* add publish:rc script and fix publish scripts commit messages ([2d13852](https://github.com/DanielAmenou/create-request/commit/2d13852424050af4af413705b0ce23fc467f19a1))
* add publish:rc script and fix publish:beta tag ([4235bf0](https://github.com/DanielAmenou/create-request/commit/4235bf07fc06d4f857f7d2e8d739fc1e13ba464e))
* update husky hook to v9 format ([1ebe1fe](https://github.com/DanielAmenou/create-request/commit/1ebe1fe86791231ee6b46a2962827c6270ab7791))


### 👷 CI/CD

* add automatic release workflow and commit validation ([c0953ca](https://github.com/DanielAmenou/create-request/commit/c0953caa206496a086ed1895c9e0a54231179089))
* add permissions ([2db8693](https://github.com/DanielAmenou/create-request/commit/2db8693ad56e4cd980e6ee50611bcca6a29805cd))
* add pre-commit hook for lint and test checks ([cae23e5](https://github.com/DanielAmenou/create-request/commit/cae23e5817ae47e75f2b63665999cdd110fd0607))
* explicitly pass token to release-please action ([91fcd16](https://github.com/DanielAmenou/create-request/commit/91fcd16c8f306cf53dc15681183deceda327e965))
* fix prerelease.config ([f473b97](https://github.com/DanielAmenou/create-request/commit/f473b978e3b92302eed72bf3ae592c3ada27b4e8))
* migrate to release-please with automated testing ([55aecf9](https://github.com/DanielAmenou/create-request/commit/55aecf9c3593e0c95bab477544047fa8bb100541))
* rename release configs and prevent major bumps on pre-release branches ([849d537](https://github.com/DanielAmenou/create-request/commit/849d5373b25fe0e354c5d990ef5a7e2843caef73))
* update Node.js version to 22 in all GitHub Actions workflows ([deede4f](https://github.com/DanielAmenou/create-request/commit/deede4fab45b83fa445e3a3095bb4f71829ec26d))


### 🔨 Chores

* add  .editorconfig ([d2951ba](https://github.com/DanielAmenou/create-request/commit/d2951ba2580fedd8fb61335372c3a81be807cee2))
* add package keywords for better discoverability ([9a86ba5](https://github.com/DanielAmenou/create-request/commit/9a86ba5c27ff1e395b9c3eda188e598d051b960f))
* **deps:** upgrade TypeScript ecosystem to latest versions ([ce7914e](https://github.com/DanielAmenou/create-request/commit/ce7914e4d2224ddebdbe02d7cd337e2234158ff2))
* make pre-commit hook quieter with raw output ([13bd9d5](https://github.com/DanielAmenou/create-request/commit/13bd9d5dbc56d331ecc3c74541e0b76ced55861c))
* **release:** 1.4.3-rc.0 ([c12e04e](https://github.com/DanielAmenou/create-request/commit/c12e04eb9519ad0d4b0d0fa473721d2b60c51214))
* **release:** 1.4.3-rc.1 ([198f119](https://github.com/DanielAmenou/create-request/commit/198f11929f20de823abcb1c24da1131e735e79d0))
* **release:** 1.4.3-rc.2 ([e968625](https://github.com/DanielAmenou/create-request/commit/e968625367ed07d9f3a9fc9d29061b124361dd86))
* **release:** 1.4.3-rc.3 ([f972969](https://github.com/DanielAmenou/create-request/commit/f972969d4f01d0882556e9b641d182b450a4d21c))
* **release:** 1.4.3-rc.4 ([fc41c76](https://github.com/DanielAmenou/create-request/commit/fc41c763102dd5d2e77a489d2c87356dac8894c2))
* **release:** 1.5.0 ([20f1e52](https://github.com/DanielAmenou/create-request/commit/20f1e529ce5cd90d6f1f17f08eca5d645ed02a35))
* remove test:compiled script and loader ([66e7ea5](https://github.com/DanielAmenou/create-request/commit/66e7ea528af7d25b13da4a6c358d5b7e7b6e167d))
* update .gitignore ([ac32eb2](https://github.com/DanielAmenou/create-request/commit/ac32eb2152ffa66ed9b65781b7a0d7b26e13e478))

## Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
