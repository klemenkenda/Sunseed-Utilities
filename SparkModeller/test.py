#from pyspark import SparkContext
#from pyspark.mllib.tree import RandomForest, RandomForestModel
#from pyspark.mllib.util import MLUtils

from datetime import date
import model
from loader import Loader


loaderM = Loader(model.model)
#print(loaderM.config);


toDate = date.today();
fromDate = date(2016, 11, 1);
loaderM.load(fromDate, toDate);
loaderM.resample();




    # sc = SparkContext(appName="PythonRandomForestRegressionExample")
    # $example on$
    # Load and parse the data file into an RDD of LabeledPoint.
    #data = MLUtils.loadLibSVMFile(sc, 'data/sample_libsvm_data.txt')
    # Split the data into training and test sets (30% held out for testing)
    #(trainingData, testData) = data.randomSplit([0.7, 0.3])

    # Train a RandomForest model.
    #  Empty categoricalFeaturesInfo indicates all features are continuous.
    #  Note: Use larger numTrees in practice.
    #  Setting featureSubsetStrategy="auto" lets the algorithm choose.
    #model = RandomForest.trainRegressor(trainingData, categoricalFeaturesInfo={},
    #                                    numTrees=30, featureSubsetStrategy="auto",
    #                                    impurity='variance', maxDepth=4, maxBins=32)

    #model = RandomForestModel.load(sc, "target/tmp/myRandomForestRegressionModel2")
    # Evaluate model on test instances and compute test error
    #predictions = model.predict(testData.map(lambda x: x.features))
    #labelsAndPredictions = testData.map(lambda lp: lp.label).zip(predictions)
    #testMSE = labelsAndPredictions.map(lambda vp: (vp[0] - vp[1]) * (vp[0] - vp[1])).sum() / float(testData.count())
    #print('\n\nTest Mean Squared Error = ' + str(testMSE) + '\n\n')
    # print('Learned regression forest model:')
    # print(model.toDebugString())

    # Save and load model
    #model.save(sc, "target/tmp/myRandomForestRegressionModel2")
    #sameModel = RandomForestModel.load(sc, "target/tmp/myRandomForestRegressionModel2")
    # $example off$
