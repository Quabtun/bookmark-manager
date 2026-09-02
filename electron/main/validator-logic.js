export function mapValidationResults(urls, uniqueUrls, uniqueResults) {
  const resultMap = new Map(uniqueUrls.map((url, index) => [url, uniqueResults[index]]))
  return urls.map((url) => resultMap.get(url) || { status: 'unknown', code: 0, message: 'not validated', finalUrl: url })
}
