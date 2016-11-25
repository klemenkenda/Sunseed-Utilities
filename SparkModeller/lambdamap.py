# learning about lambda and map function
a = [1, 2, 3, 4]
b = [5, 6, 7, 8]

y = lambda x: x % 2

yArray = map(y, a)

for item in yArray:
    print(item);
